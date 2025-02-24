import {
  IDict,
  IJCadModel,
  IJCadObject,
  IJcadObjectDocChange,
  IJupyterCadClientState,
  IJupyterCadDoc,
  IJupyterCadModel,
  ISelection
} from '@jupytercad/schema';
import { Dialog, ReactWidget, showDialog } from '@jupyterlab/apputils';
import {
  closeIcon,
  LabIcon,
  PanelWithToolbar,
  ToolbarButtonComponent
} from '@jupyterlab/ui-components';
import { JSONObject } from '@lumino/coreutils';
import { Panel } from '@lumino/widgets';
import {
  ReactTree,
  ThemeSettings,
  TreeNodeId,
  TreeNodeList
} from '@naisutech/react-tree';
import * as React from 'react';
import { v4 as uuid } from 'uuid';

import visibilitySvg from '../../style/icon/visibility.svg';
import visibilityOffSvg from '../../style/icon/visibilityOff.svg';
import { IControlPanelModel } from '../types';
import { setVisible } from '../commands';

const visibilityIcon = new LabIcon({
  name: 'jupytercad:visibilityIcon',
  svgstr: visibilitySvg
});
const visibilityOffIcon = new LabIcon({
  name: 'jupytercad:visibilityOffIcon',
  svgstr: visibilityOffSvg
});

export const TREE_THEMES: ThemeSettings = {
  labTheme: {
    text: {
      fontSize: '14px',
      fontFamily: 'var(--jp-ui-font-family)',
      color: 'var(--jp-ui-font-color1)',
      selectedColor: 'var(--jp-ui-inverse-font-color1)',
      hoverColor: 'var(--jp-ui-font-color2)'
    },
    nodes: {
      folder: {
        bgColor: 'var(--jp-layout-color1)',
        selectedBgColor: 'var(--jp-layout-color2)',
        hoverBgColor: 'var(--jp-layout-color2)'
      },
      leaf: {
        bgColor: 'var(--jp-layout-color1)',
        selectedBgColor: 'var(--jp-layout-color2)',
        hoverBgColor: 'var(--jp-layout-color2)'
      },
      icons: {
        size: '9px',
        folderColor: 'var(--jp-inverse-layout-color3)',
        leafColor: 'var(--jp-inverse-layout-color3)'
      }
    }
  }
};

export class ObjectTree extends PanelWithToolbar {
  constructor(params: ObjectTree.IOptions) {
    super(params);
    this.title.label = 'Objects tree';
    const body = ReactWidget.create(
      <ObjectTreeReact cpModel={params.controlPanelModel} />
    );
    this.addWidget(body);
    this.addClass('jpcad-sidebar-treepanel');
  }
}

interface IStates {
  jcadOption?: IDict;
  filePath?: string;
  jcadObject?: IJCadModel;
  options?: JSONObject;
  selectedNodes: string[];
  clientId: number | null; // ID of the yjs client
  id: string; // ID of the component, it is used to identify which component
  editingNode: TreeNodeId | null;
  editingNodeValue: string | null;
  //is the source of awareness updates.
  openNodes: (number | string)[];
}

interface IProps {
  cpModel: IControlPanelModel;
}

export const handleRemoveObject = (
  objectId: string,
  sharedModel: IJupyterCadDoc,
  syncSelected: () => void
): void => {
  if (!sharedModel) {
    return;
  }

  const dependants = sharedModel.getDependants(objectId);

  let body: React.JSX.Element;
  if (dependants.length) {
    body = (
      <div>
        {'Removing this object will also result in removing:'}
        <ul>
          {dependants.map(dependant => (
            <li key={dependant}>{dependant}</li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = <div>Are you sure?</div>;
  }

  showDialog({
    title: `Removing ${objectId}`,
    body,
    buttons: [Dialog.okButton(), Dialog.cancelButton()]
  }).then(({ button: { accept } }) => {
    if (accept) {
      const toRemove = dependants.concat([objectId]);
      const objetToRemove = sharedModel.getObjectByName(objectId);
      sharedModel.transact(() => {
        objetToRemove?.dependencies?.forEach((dependency: string) => {
          setVisible(sharedModel, dependency, true);
        });
        sharedModel.removeObjects(toRemove);
      });
    }
  });

  syncSelected();
};

class ObjectTreeReact extends React.Component<IProps, IStates> {
  constructor(props: IProps) {
    super(props);

    this.state = {
      filePath: this.props.cpModel.filePath,
      jcadObject: this.props.cpModel.jcadModel?.getAllObject(),
      selectedNodes: [],
      clientId: null,
      id: uuid(),
      openNodes: [],
      editingNode: null,
      editingNodeValue: ''
    };
    this.props.cpModel.jcadModel?.sharedObjectsChanged.connect(
      this._sharedJcadModelChanged
    );
    this.props.cpModel.documentChanged.connect((_, document) => {
      if (document) {
        this.props.cpModel.disconnect(this._sharedJcadModelChanged);
        this.props.cpModel.disconnect(this._onClientSharedStateChanged);

        document.model.sharedObjectsChanged.connect(
          this._sharedJcadModelChanged
        );
        document.model.clientStateChanged.connect(
          this._onClientSharedStateChanged
        );
        document.model.sharedOptionsChanged.connect(
          this._onClientSharedOptionsChanged
        );

        const currentSelection = this._getCurrentSelection();

        if (!currentSelection) {
          this.setState(old => ({
            ...old,
            filePath: document.model.filePath,
            jcadObject: this.props.cpModel.jcadModel?.getAllObject(),
            options: this.props.cpModel.sharedModel?.options,
            clientId: document.model.getClientId()
          }));
        } else {
          this.setState(old => ({
            ...old,
            selectedNodes: currentSelection.newSelectedNodes,
            openNodes: currentSelection.newOpenNodes,
            filePath: document.model.filePath,
            jcadObject: this.props.cpModel.jcadModel?.getAllObject(),
            options: this.props.cpModel.sharedModel?.options,
            clientId: document.model.getClientId()
          }));
        }
      } else {
        this.setState({
          filePath: undefined,
          jcadObject: undefined,
          jcadOption: undefined
        });
      }
    });
  }

  stateToTree = () => {
    if (this.state.jcadObject) {
      return this.state.jcadObject.map(obj => {
        const name = obj.name;
        const items: TreeNodeList = [];
        if (obj.shape) {
          items.push({
            id: `${name}#shape#${obj.shape}#${this.state.filePath}`,
            label: 'Shape',
            parentId: name
          });
        }
        if (obj.operators) {
          items.push({
            id: `${name}#operator#${this.state.filePath}`,
            label: 'Operators',
            parentId: name
          });
        }
        return {
          id: name,
          label: obj.name ?? `Object (#${name})`,
          parentId: null,
          items
        };
      });
    }

    return [];
  };

  getObjectFromName(name: string | null): IJCadObject | undefined {
    if (name && this.state.jcadObject) {
      const obj = this.state.jcadObject.filter(o => o.name === name);
      if (obj.length > 0) {
        return obj[0];
      }
    }
  }

  handleNodeClick = (objectId: string) => {
    const object = this.getObjectFromName(objectId);

    if (object && object.visible === true) {
      const objPosition = object?.parameters?.Placement?.Position || {
        x: 0,
        y: 0,
        z: 0
      };

      const event = new CustomEvent('jupytercadObjectSelection', {
        detail: {
          objectId,
          objPosition,
          mainViewModelId: this.props.cpModel.mainViewModel?.id
        }
      });
      window.dispatchEvent(event);
    }
  };

  private _sharedJcadModelChanged = (
    sender: IJupyterCadModel,
    change: IJcadObjectDocChange
  ): void => {
    if (change.objectChange) {
      const currentSelection = this._getCurrentSelection();

      if (!currentSelection) {
        this.setState(old => ({
          ...old,
          jcadObject: this.props.cpModel.jcadModel?.getAllObject(),
          options: this.props.cpModel.sharedModel?.options
        }));
      } else {
        this.setState(old => ({
          ...old,
          selectedNodes: currentSelection.newSelectedNodes,
          openNodes: currentSelection.newOpenNodes,
          jcadObject: this.props.cpModel.jcadModel?.getAllObject(),
          options: this.props.cpModel.sharedModel?.options
        }));
      }
    }
  };

  private _selectedNodes(selection: { [key: string]: ISelection }): string[] {
    const meshNames = new Set<string>();
    for (const selectionName in selection) {
      const selected = selection[selectionName];

      if (selected.type === 'shape') {
        meshNames.add(selectionName);
      } else {
        meshNames.add(selected.parent as string);
      }
    }

    return Array.from(meshNames);
  }

  private _onClientSharedStateChanged = (
    sender: IJupyterCadModel,
    clients: Map<number, IJupyterCadClientState>
  ): void => {
    const currentSelection = this._getCurrentSelection(clients);

    if (!currentSelection) {
      return;
    }

    const { newSelectedNodes, newOpenNodes } = currentSelection;
    const { selectedNodes, openNodes } = this.state;
    if (
      JSON.stringify(selectedNodes) !== JSON.stringify(newSelectedNodes) ||
      JSON.stringify(openNodes) !== JSON.stringify(newOpenNodes)
    ) {
      this.setState(old => ({
        ...old,
        openNodes: newOpenNodes,
        selectedNodes: newSelectedNodes
      }));
    }
  };

  private _getCurrentSelection(
    clients?: Map<number, IJupyterCadClientState>
  ):
    | { newSelectedNodes: string[]; newOpenNodes: (string | number)[] }
    | undefined {
    const localState = this.props.cpModel.jcadModel?.localState;

    if (!localState) {
      return;
    }

    let newSelectedNodes: string[] = [];
    if (clients && localState.remoteUser) {
      // We are in following mode.
      // Sync selections from a remote user
      const remoteState = clients.get(localState.remoteUser);

      if (remoteState?.selected?.value) {
        newSelectedNodes = this._selectedNodes(remoteState.selected.value);
      }
    } else if (localState.selected?.value) {
      newSelectedNodes = this._selectedNodes(localState.selected.value);
    }

    const newOpenNodes = [...this.state.openNodes];
    for (const selectedNode of newSelectedNodes) {
      if (selectedNode && newOpenNodes.indexOf(selectedNode) === -1) {
        newOpenNodes.push(selectedNode);
      }
    }

    return { newSelectedNodes, newOpenNodes };
  }

  private _onClientSharedOptionsChanged = (
    sender: IJupyterCadModel,
    clients: any
  ): void => {
    this.setState(old => ({ ...old, options: sender.sharedModel.options }));
  };

  private _handleRemoveObject = (objectId: string): void => {
    const sharedModel = this.props.cpModel.jcadModel?.sharedModel;
    if (!sharedModel) {
      return;
    }

    handleRemoveObject(objectId, sharedModel, () => {
      this.props.cpModel.jcadModel?.syncSelected({});
    });
  };

  render(): React.ReactNode {
    const { selectedNodes, openNodes } = this.state;
    const data = this.stateToTree();

    const selectedNodeIds: TreeNodeId[] = [];
    for (const selectedNode of selectedNodes) {
      const parentNode = data.filter(node => node.id === selectedNode);
      if (parentNode.length > 0 && parentNode[0].items.length > 0) {
        selectedNodeIds.push(parentNode[0].items[0].id);
      }
    }

    return (
      <div className="jpcad-treeview-wrapper jp-scrollbar-tiny" tabIndex={0}>
        <ReactTree
          multiSelect={true}
          nodes={data}
          openNodes={openNodes}
          selectedNodes={selectedNodeIds}
          messages={{ noData: 'No data' }}
          theme={'labTheme'}
          themes={TREE_THEMES}
          onToggleSelectedNodes={id => {
            if (id === selectedNodeIds) {
              return;
            }

            if (id && id.length > 0) {
              const newSelection: { [key: string]: ISelection } = {};
              for (const subid of id) {
                const name = subid as string;
                if (name.includes('#')) {
                  newSelection[name.split('#')[0]] = {
                    type: 'shape'
                  };
                } else {
                  newSelection[name] = {
                    type: 'shape'
                  };
                }
              }
              this.props.cpModel.jcadModel?.syncSelected(
                newSelection,
                this.state.id
              );
            } else {
              this.props.cpModel.jcadModel?.syncSelected({});
            }
          }}
          RenderNode={opts => {
            // const paddingLeft = 25 * (opts.level + 1);
            const jcadObj = this.getObjectFromName(
              opts.node.parentId as string
            );
            let visible = true;
            if (jcadObj) {
              visible = jcadObj.visible;
            }

            return (
              <div
                className={`jpcad-control-panel-tree ${
                  opts.selected ? 'selected' : ''
                }`}
                onClick={() => this.handleNodeClick(opts.node.id as string)}
              >
                <div
                  style={{
                    paddingLeft: '5px',
                    minHeight: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minWidth: 0
                  }}
                >
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflowX: 'hidden'
                    }}
                    onClick={() => this.setState({ editingNode: opts.node.id })}
                  >
                    {this.state.editingNode === opts.node.id ? (
                      <input
                        type="text"
                        value={this.state.editingNodeValue || opts.node.label}
                        autoFocus
                        onBlur={() => this.setState({ editingNode: null })}
                        onChange={e =>
                          this.setState({ editingNodeValue: e.target.value })
                        }
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            console.log(
                              'Updated name:',
                              this.state.editingNodeValue
                            );
                            const updatedName = this.state.editingNodeValue;
                            const objectName = opts.node.id;

                            if (this.props.cpModel.mainViewModel) {
                              const obj =
                                this.props.cpModel.jcadModel?.sharedModel.getObjectByName(
                                  objectName as string
                                );
                              if (obj) {
                                this.props.cpModel.sharedModel?.updateObjectByName(
                                  objectName as string,
                                  {
                                    data: {
                                      key: 'name',
                                      value: updatedName
                                    }
                                  }
                                );
                              }
                            }
                            this.setState({
                              editingNode: null,
                              editingNodeValue: null
                            });
                          }
                        }}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          fontSize: 'inherit',
                          color: 'inherit'
                        }}
                      />
                    ) : (
                      opts.node.label
                    )}
                  </span>
                  {opts.type === 'leaf' ? (
                    <div style={{ display: 'flex' }}>
                      <ToolbarButtonComponent
                        className={'jp-ToolbarButtonComponent'}
                        onClick={() => {
                          const objectId = opts.node.parentId as string;
                          const obj = this.getObjectFromName(objectId);
                          if (obj) {
                            const sharedModel =
                              this.props.cpModel.jcadModel?.sharedModel;
                            if (sharedModel) {
                              sharedModel.updateObjectByName(objectId, {
                                data: { key: 'visible', value: !obj.visible }
                              });
                            }
                          }
                        }}
                        icon={visible ? visibilityIcon : visibilityOffIcon}
                      />
                      <ToolbarButtonComponent
                        className={'jp-ToolbarButtonComponent'}
                        onClick={() => {
                          const objectId = opts.node.parentId as string;
                          this._handleRemoveObject(objectId);
                        }}
                        icon={closeIcon}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }}
        />
      </div>
    );
  }
}

export namespace ObjectTree {
  /**
   * Instantiation options for `ObjectTree`.
   */
  export interface IOptions extends Panel.IOptions {
    controlPanelModel: IControlPanelModel;
  }
}
