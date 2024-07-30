import {
  IDict,
  IJCadFormSchemaRegistry,
  IJCadModel,
  IJcadObjectDocChange,
  IJupyterCadClientState,
  IJupyterCadDoc,
  IJupyterCadModel,
  IJupyterCadTracker
} from '@jupytercad/schema';
import { ReactWidget, showErrorMessage } from '@jupyterlab/apputils';
import { PanelWithToolbar } from '@jupyterlab/ui-components';
import { Panel } from '@lumino/widgets';
import * as React from 'react';
import { v4 as uuid } from 'uuid';

import {
  focusInputField,
  itemFromName,
  removeStyleFromProperty
} from '../tools';
import { IControlPanelModel } from '../types';
import { ObjectPropertiesForm } from './formbuilder';
import { JupyterCadWidget } from '../widget';

export class ObjectProperties extends PanelWithToolbar {
  constructor(params: ObjectProperties.IOptions) {
    super(params);
    this.title.label = 'Objects Properties';
    const body = ReactWidget.create(
      <ObjectPropertiesReact
        cpModel={params.controlPanelModel}
        tracker={params.tracker}
        formSchemaRegistry={params.formSchemaRegistry}
      />
    );
    this.addWidget(body);
    this.addClass('jpcad-sidebar-propertiespanel');
  }
}

interface IStates {
  jcadOption?: IDict;
  filePath?: string;
  jcadObject?: IJCadModel;
  selectedObjectData?: IDict;
  selectedObject?: string;
  schema?: IDict;
  clientId: number | null; // ID of the yjs client
  id: string; // ID of the component, it is used to identify which component
  //is the source of awareness updates.
}

interface IProps {
  cpModel: IControlPanelModel;
  tracker: IJupyterCadTracker;
  formSchemaRegistry: IJCadFormSchemaRegistry;
}

class ObjectPropertiesReact extends React.Component<IProps, IStates> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      filePath: this.props.cpModel.filePath,
      jcadObject: this.props.cpModel.jcadModel?.getAllObject(),
      clientId: null,
      id: uuid()
    };
    this._formSchema = props.formSchemaRegistry.getSchemas();

    this.props.cpModel.jcadModel?.sharedObjectsChanged.connect(
      this._sharedJcadModelChanged
    );
    this.props.cpModel.documentChanged.connect((_, changed) => {
      if (changed) {
        this.props.cpModel.disconnect(this._sharedJcadModelChanged);
        this.props.cpModel.disconnect(this._onClientSharedStateChanged);

        changed.context.model.sharedObjectsChanged.connect(
          this._sharedJcadModelChanged
        );
        changed.context.model.clientStateChanged.connect(
          this._onClientSharedStateChanged
        );
        this.setState(old => ({
          ...old,
          filePath: changed.context.localPath,
          jcadObject: this.props.cpModel.jcadModel?.getAllObject(),
          clientId: changed.context.model.getClientId()
        }));
      } else {
        this.setState({
          jcadOption: undefined,
          filePath: undefined,
          jcadObject: undefined,
          selectedObjectData: undefined,
          selectedObject: undefined,
          schema: undefined
        });
      }
    });
  }

  async syncObjectProperties(
    objectName: string | undefined,
    properties: { [key: string]: any }
  ) {
    if (!this.state.jcadObject || !objectName) {
      return;
    }

    const currentWidget = this.props.tracker
      .currentWidget as JupyterCadWidget | null;
    if (!currentWidget) {
      return;
    }

    const model = this.props.cpModel.jcadModel;
    if (!model) {
      return;
    }

    // getContent already returns a deep copy of the content, we can change it safely here
    const updatedContent = model.getContent();
    for (const object of updatedContent.objects) {
      if (object.name === objectName) {
        object.parameters = {
          ...object.parameters,
          ...properties
        };
      }
    }

    // Try a dry run
    const dryRunResult =
      await currentWidget.content.currentViewModel.dryRun(updatedContent);
    if (dryRunResult.status === 'error') {
      showErrorMessage(
        'Failed to update the shape',
        'The tool was unable to update the desired shape due to invalid parameter values. The values you entered may not be compatible with the dimensions of your piece.'
      );
      return;
    }

    // Dry run was successful, ready to apply the update now
    const meta: IDict = dryRunResult.shapeMetadata?.[objectName] ?? {};
    const obj = model.sharedModel.getObjectByName(objectName);
    if (obj) {
      model.sharedModel.updateObjectByName(objectName, {
        data: {
          key: 'parameters',
          value: {
            ...obj['parameters'],
            ...properties
          }
        },
        meta
      });
    }
  }

  syncSelectedField = (
    id: string | null,
    value: any,
    parentType: 'panel' | 'dialog'
  ) => {
    let property: string | null = null;
    if (id) {
      const prefix = id.split('_')[0];
      property = id.substring(prefix.length);
    }
    this.props.cpModel.jcadModel?.syncSelectedPropField({
      parentType,
      id: property,
      value
    });
  };

  private _sharedJcadModelChanged = (
    _: IJupyterCadDoc,
    changed: IJcadObjectDocChange
  ): void => {
    this.setState(old => {
      if (old.selectedObject) {
        const jcadObject = this.props.cpModel.jcadModel?.getAllObject();
        if (jcadObject) {
          const selectedObj = itemFromName(old.selectedObject, jcadObject);
          if (!selectedObj) {
            return old;
          }
          const selectedObjectData = selectedObj['parameters'];
          return {
            ...old,
            jcadObject: jcadObject,
            selectedObjectData
          };
        } else {
          return old;
        }
      } else {
        return {
          ...old,
          jcadObject: this.props.cpModel.jcadModel?.getAllObject()
        };
      }
    });
  };

  private _onClientSharedStateChanged = (
    sender: IJupyterCadModel,
    clients: Map<number, IJupyterCadClientState>
  ): void => {
    const remoteUser = this.props.cpModel.jcadModel?.localState?.remoteUser;
    const clientId = this.state.clientId;
    let newState: IJupyterCadClientState | undefined;
    if (remoteUser) {
      newState = clients.get(remoteUser);

      const id = newState?.selectedPropField?.id;
      const value = newState?.selectedPropField?.value;
      const parentType = newState?.selectedPropField?.parentType;
      if (parentType === 'panel') {
        this._lastSelectedPropFieldId = focusInputField(
          `${this.state.filePath}::panel`,
          id,
          value,
          newState?.user?.color,
          this._lastSelectedPropFieldId
        );
      }
    } else {
      const localState = clientId ? clients.get(clientId) : null;
      if (this._lastSelectedPropFieldId) {
        removeStyleFromProperty(
          `${this.state.filePath}::panel`,
          this._lastSelectedPropFieldId,
          ['border-color', 'box-shadow']
        );

        this._lastSelectedPropFieldId = undefined;
      }
      if (
        localState &&
        localState.selected?.emitter &&
        localState.selected.emitter !== this.state.id &&
        localState.selected?.value
      ) {
        newState = localState;
      }
    }
    if (newState) {
      const selection = newState.selected.value;
      const selectedObjectNames = Object.keys(selection || {});
      // Only show object properties if ONE object is selected and it's a shape
      if (selection === undefined || selectedObjectNames.length !== 1) {
        this.setState(old => ({
          ...old,
          schema: undefined,
          selectedObject: '',
          selectedObjectData: undefined
        }));
        return;
      }

      let selectedObject = selectedObjectNames[0];
      if (
        selection[selectedObject] &&
        selection[selectedObject].type !== 'shape'
      ) {
        selectedObject = selection[selectedObject].parent as string;
      }

      if (selectedObject !== this.state.selectedObject) {
        const objectData = this.props.cpModel.jcadModel?.getAllObject();
        if (objectData) {
          let schema;
          const selectedObj = itemFromName(selectedObject, objectData);
          if (!selectedObj) {
            return;
          }

          if (selectedObj.shape) {
            schema = this._formSchema.get(selectedObj.shape);
          }
          const selectedObjectData = selectedObj['parameters'];
          this.setState(old => ({
            ...old,
            selectedObjectData,
            selectedObject,
            schema
          }));
        }
      }
    }
  };

  render(): React.ReactNode {
    // Fill form schema with available objects
    const form_schema = this.state.schema;
    if (form_schema) {
      const allObjects = this.props.cpModel.jcadModel
        ?.getAllObject()
        .reduce((all: string[], o) => {
          o.name !== this.state.selectedObject && all.push(o.name);
          return all;
        }, []);
      for (const prop in form_schema['properties']) {
        const fcType = form_schema['properties'][prop]['fcType'];
        if (fcType) {
          const propDef = form_schema['properties'][prop];
          switch (fcType) {
            case 'App::PropertyLink':
              propDef['enum'] = allObjects;
              break;
            case 'App::PropertyLinkList':
              propDef['items']['enum'] = allObjects;
              break;
            default:
          }
        }
      }
    }

    return this.state.schema && this.state.selectedObjectData ? (
      <ObjectPropertiesForm
        parentType="panel"
        filePath={`${this.state.filePath}::panel`}
        schema={form_schema}
        sourceData={this.state.selectedObjectData}
        syncData={(properties: { [key: string]: any }) => {
          this.syncObjectProperties(this.state.selectedObject, properties);
        }}
        syncSelectedField={this.syncSelectedField}
      />
    ) : (
      <div></div>
    );
  }

  private _lastSelectedPropFieldId?: string;
  private _formSchema: Map<string, IDict>;
}

export namespace ObjectProperties {
  /**
   * Instantiation options for `ObjectProperties`.
   */
  export interface IOptions extends Panel.IOptions {
    controlPanelModel: IControlPanelModel;
    formSchemaRegistry: IJCadFormSchemaRegistry;
    tracker: IJupyterCadTracker;
  }
}
