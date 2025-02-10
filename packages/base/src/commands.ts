import {
  IDict,
  IDryRunResponsePayload,
  IJCadContent,
  IJCadFormSchemaRegistry,
  IJCadObject,
  IJCadWorkerRegistry,
  IJupyterCadDoc,
  IJupyterCadModel,
  ISelection,
  Parts
} from '@jupytercad/schema';
import { CommandRegistry } from '@lumino/commands';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { showErrorMessage, WidgetTracker } from '@jupyterlab/apputils';
import { ITranslator } from '@jupyterlab/translation';
import { filterIcon, redoIcon, undoIcon } from '@jupyterlab/ui-components';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import { FormDialog } from './formdialog';
import { SketcherDialog } from './sketcher/sketcherdialog';
import {
  axesIcon,
  boxIcon,
  coneIcon,
  cutIcon,
  cylinderIcon,
  explodedViewIcon,
  extrusionIcon,
  intersectionIcon,
  requestAPI,
  sphereIcon,
  torusIcon,
  unionIcon,
  clippingIcon,
  chamferIcon,
  filletIcon,
  wireframeIcon,
  transformIcon
} from './tools';
import keybindings from './keybindings.json';
import { DEFAULT_MESH_COLOR } from './3dview/helpers';
import { JupyterCadPanel, JupyterCadOutputwidget } from './widget';
import { PathExt } from '@jupyterlab/coreutils';
import { MainViewModel } from './3dview/mainviewmodel';
import { handleRemoveObject } from './panelview';
import { v4 as uuid } from 'uuid';
import { ExplodedView, JupyterCadTracker } from './types';
import { JSONObject } from '@lumino/coreutils';
import { JupyterCadDocumentWidget } from './widget';

export function newName(type: string, model: IJupyterCadModel): string {
  const sharedModel = model.sharedModel;

  let n = 1;
  let name = `${type} 1`;
  while (sharedModel.objectExists(name)) {
    name = `${type} ${++n}`;
  }

  return name;
}

export async function dryRunCheck(options: {
  jcadContent: IJCadContent;
  mainView: MainViewModel;
  requestedOperator: string;
}): Promise<IDryRunResponsePayload | null> {
  const { jcadContent, mainView, requestedOperator } = options;
  const dryRunResult = await mainView.dryRun(jcadContent);
  if (dryRunResult.status === 'error') {
    showErrorMessage(
      `Failed to apply ${requestedOperator} operator`,
      `The ${requestedOperator} tool was unable to create the desired shape due to invalid parameter values. The values you entered may not be compatible with the dimensions of your piece.`
    );
    return null;
  }
  return dryRunResult;
}

export function setVisible(
  sharedModel: IJupyterCadDoc,
  name: string,
  value: boolean
) {
  sharedModel.updateObjectByName(name, {
    data: { key: 'visible', value }
  });
}

const PARTS = {
  box: {
    title: 'Box parameters',
    shape: 'Part::Box',
    default: (model: IJupyterCadModel) => {
      return {
        Name: newName('Box', model),
        Length: 1,
        Width: 1,
        Height: 1,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    }
  },
  cylinder: {
    title: 'Cylinder parameters',
    shape: 'Part::Cylinder',
    default: (model: IJupyterCadModel) => {
      return {
        Name: newName('Cylinder', model),
        Radius: 1,
        Height: 1,
        Angle: 360,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    }
  },
  sphere: {
    title: 'Sphere parameters',
    shape: 'Part::Sphere',
    default: (model: IJupyterCadModel) => {
      return {
        Name: newName('Sphere', model),
        Radius: 1,
        Angle1: -90,
        Angle2: 90,
        Angle3: 360,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    }
  },
  cone: {
    title: 'Cone parameters',
    shape: 'Part::Cone',
    default: (model: IJupyterCadModel) => {
      return {
        Name: newName('Cone', model),
        Radius1: 1,
        Radius2: 0.5,
        Height: 1,
        Angle: 360,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    }
  },
  torus: {
    title: 'Torus parameters',
    shape: 'Part::Torus',
    default: (model: IJupyterCadModel) => {
      return {
        Name: newName('Torus', model),
        Radius1: 1,
        Radius2: 0.5,
        Angle1: -180,
        Angle2: 180,
        Angle3: 360,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    }
  }
};

function getSelectedMeshName(
  selection: { [key: string]: ISelection } | undefined,
  index: number
): string {
  if (selection === undefined) {
    return '';
  }

  const selectedNames = Object.keys(selection);

  if (selectedNames[index]) {
    const selected = selection[selectedNames[index]];

    if (selected.type === 'shape') {
      return selectedNames[index];
    } else {
      return selected.parent as string;
    }
  }

  return '';
}

function getSelectedEdge(
  selection: { [key: string]: ISelection } | undefined
): { shape: string; edgeIndex: number } | undefined {
  if (selection === undefined) {
    return;
  }

  const selectedNames = Object.keys(selection);
  for (const name of selectedNames) {
    if (selection[name].type === 'edge') {
      return {
        shape: selection[name].parent!,
        edgeIndex: selection[name].edgeIndex!
      };
    }
  }
}

export async function executeOperator(
  name: string,
  objectModel: IJCadObject,
  current: JupyterCadOutputwidget,
  transaction: (sharedModel: IJupyterCadDoc) => any
) {
  const sharedModel = current.model.sharedModel;

  if (!sharedModel) {
    return;
  }

  if (sharedModel.objectExists(objectModel.name)) {
    showErrorMessage(
      'The object already exists',
      'There is an existing object with the same name.'
    );

    return;
  }

  // Try a dry run with the update content to verify its feasibility
  const currentJcadContent = current.model.getContent();
  const updatedContent: IJCadContent = {
    ...currentJcadContent,
    objects: [...currentJcadContent.objects, objectModel]
  };

  const dryRunResult = await dryRunCheck({
    jcadContent: updatedContent,
    mainView: current.content.currentViewModel,
    requestedOperator: name
  });
  if (!dryRunResult) {
    return;
  }
  // Everything's good, we can apply the change to the shared model

  const objMeta = dryRunResult.shapeMetadata?.[objectModel.name];
  if (objMeta) {
    objectModel.shapeMetadata = objMeta;
  }
  sharedModel.transact(() => {
    transaction(sharedModel);
    current.model.syncSelected(
      { [objectModel.name]: { type: 'shape' } },
      uuid()
    );
  });
}

const OPERATORS = {
  cut: {
    title: 'Cut parameters',
    shape: 'Part::Cut',
    default: (model: IJupyterCadModel) => {
      const objects = model.getAllObject();
      const selected = model.localState?.selected.value || {};
      const sel0 = getSelectedMeshName(selected, 0);
      const sel1 = getSelectedMeshName(selected, 1);
      const baseName = sel0 || objects[0].name || '';
      const baseModel = model.sharedModel.getObjectByName(baseName);
      return {
        Name: newName('Cut', model),
        Base: baseName,
        Tool: sel1 || objects[1].name || '',
        Refine: false,
        Color: baseModel?.parameters?.Color || DEFAULT_MESH_COLOR,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    },
    syncData: (current: JupyterCadOutputwidget) => {
      return async (props: IDict) => {
        const { Name, ...parameters } = props;
        const objectModel: IJCadObject = {
          shape: 'Part::Cut',
          parameters,
          visible: true,
          name: Name,
          dependencies: [parameters['Base'], parameters['Tool']]
        };

        return executeOperator(
          'Cut',
          objectModel,
          current,
          (sharedModel: IJupyterCadDoc) => {
            setVisible(sharedModel, parameters['Base'], false);
            setVisible(sharedModel, parameters['Tool'], false);

            sharedModel.addObject(objectModel);
          }
        );
      };
    }
  },
  extrusion: {
    title: 'Extrusion parameters',
    shape: 'Part::Extrusion',
    default: (model: IJupyterCadModel) => {
      const objects = model.getAllObject();
      const selected = model.localState?.selected.value || {};
      const sel0 = getSelectedMeshName(selected, 0);
      const baseName = sel0 || objects[0].name || '';
      const baseModel = model.sharedModel.getObjectByName(baseName);
      return {
        Name: newName('Extrusion', model),
        Base: baseName,
        Dir: [0, 0, 1],
        LengthFwd: 10,
        LengthRev: 0,
        Solid: false,
        Color: baseModel?.parameters?.Color || DEFAULT_MESH_COLOR,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    },
    syncData: (current: JupyterCadOutputwidget) => {
      return async (props: IDict) => {
        const { Name, ...parameters } = props;
        const objectModel: IJCadObject = {
          shape: 'Part::Extrusion',
          parameters,
          visible: true,
          name: Name,
          dependencies: [parameters['Base']]
        };

        return executeOperator(
          'Extrusion',
          objectModel,
          current,
          (sharedModel: IJupyterCadDoc) => {
            setVisible(sharedModel, parameters['Base'], false);

            sharedModel.addObject(objectModel);
          }
        );
      };
    }
  },
  union: {
    title: 'Fuse parameters',
    shape: 'Part::MultiFuse',
    default: (model: IJupyterCadModel) => {
      const objects = model.getAllObject();
      const selected = model.localState?.selected.value || {};

      const selectedShapes = Object.keys(selected).map(key => key);

      // Fallback to at least two objects if selection is empty
      const baseShapes =
        selectedShapes.length > 0
          ? selectedShapes
          : [objects[0].name || '', objects[1].name || ''];

      const baseModel = model.sharedModel.getObjectByName(baseShapes[0]);
      return {
        Name: newName('Union', model),
        Shapes: baseShapes,
        Refine: false,
        Color: baseModel?.parameters?.Color || DEFAULT_MESH_COLOR,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    },
    syncData: (current: JupyterCadOutputwidget) => {
      return async (props: IDict) => {
        const { Name, ...parameters } = props;
        const objectModel: IJCadObject = {
          shape: 'Part::MultiFuse',
          parameters,
          visible: true,
          name: Name,
          dependencies: parameters['Shapes']
        };

        return executeOperator(
          'Fuse',
          objectModel,
          current,
          (sharedModel: IJupyterCadDoc) => {
            parameters['Shapes'].map((shape: string) => {
              setVisible(sharedModel, shape, false);
            });

            sharedModel.addObject(objectModel);
          }
        );
      };
    }
  },
  intersection: {
    title: 'Intersection parameters',
    shape: 'Part::MultiCommon',
    default: (model: IJupyterCadModel) => {
      const objects = model.getAllObject();
      const selected = model.localState?.selected.value || {};
      const sel0 = getSelectedMeshName(selected, 0);
      const sel1 = getSelectedMeshName(selected, 1);
      const baseName = sel0 || objects[0].name || '';
      const baseModel = model.sharedModel.getObjectByName(baseName);
      return {
        Name: newName('Intersection', model),
        Shapes: [baseName, sel1 || objects[1].name || ''],
        Refine: false,
        Color: baseModel?.parameters?.Color || DEFAULT_MESH_COLOR,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    },
    syncData: (current: JupyterCadOutputwidget) => {
      return async (props: IDict) => {
        const { Name, ...parameters } = props;
        const objectModel: IJCadObject = {
          shape: 'Part::MultiCommon',
          parameters,
          visible: true,
          name: Name,
          dependencies: parameters['Shapes']
        };

        return executeOperator(
          'Intersection',
          objectModel,
          current,
          (sharedModel: IJupyterCadDoc) => {
            parameters['Shapes'].map((shape: string) => {
              setVisible(sharedModel, shape, false);
            });

            sharedModel.addObject(objectModel);
          }
        );
      };
    }
  },
  chamfer: {
    title: 'Chamfer parameters',
    shape: 'Part::Chamfer',
    default: (model: IJupyterCadModel) => {
      const objects = model.getAllObject();
      const selectedEdge = getSelectedEdge(model.localState?.selected.value);
      const baseName = selectedEdge?.shape || objects[0].name || '';
      const baseModel = model.sharedModel.getObjectByName(baseName);
      return {
        Name: newName('Chamfer', model),
        Base: baseName,
        Edge: selectedEdge?.edgeIndex || 0,
        Dist: 0.2,
        Color: baseModel?.parameters?.Color || DEFAULT_MESH_COLOR,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    },
    syncData: (current: JupyterCadOutputwidget) => {
      return async (props: IDict) => {
        const { Name, ...parameters } = props;
        const objectModel: IJCadObject = {
          shape: 'Part::Chamfer',
          parameters,
          visible: true,
          name: Name,
          dependencies: [parameters['Base']]
        };

        return executeOperator(
          'Chamfer',
          objectModel,
          current,
          (sharedModel: IJupyterCadDoc) => {
            setVisible(sharedModel, parameters['Base'], false);

            sharedModel.addObject(objectModel);
          }
        );
      };
    }
  },
  fillet: {
    title: 'Fillet parameters',
    shape: 'Part::Fillet',
    default: (model: IJupyterCadModel) => {
      const objects = model.getAllObject();
      const selectedEdge = getSelectedEdge(model.localState?.selected.value);
      const baseName = selectedEdge?.shape || objects[0].name || '';
      const baseModel = model.sharedModel.getObjectByName(baseName);
      return {
        Name: newName('Fillet', model),
        Base: baseName,
        Edge: selectedEdge?.edgeIndex || 0,
        Radius: 0.2,
        Color: baseModel?.parameters?.Color || DEFAULT_MESH_COLOR,
        Placement: { Position: [0, 0, 0], Axis: [0, 0, 1], Angle: 0 }
      };
    },
    syncData: (current: JupyterCadOutputwidget) => {
      return async (props: IDict) => {
        const { Name, ...parameters } = props;
        const objectModel: IJCadObject = {
          shape: 'Part::Fillet',
          parameters,
          visible: true,
          name: Name,
          dependencies: [parameters['Base']]
        };

        return executeOperator(
          'Fillet',
          objectModel,
          current,
          (sharedModel: IJupyterCadDoc) => {
            setVisible(sharedModel, parameters['Base'], false);

            sharedModel.addObject(objectModel);
          }
        );
      };
    }
  }
};

const AXES_FORM = {
  title: 'Axes Helper',
  schema: {
    type: 'object',
    required: ['Size', 'Visible'],
    additionalProperties: false,
    properties: {
      Size: {
        type: 'number',
        description: 'Size of the axes'
      },
      Visible: {
        type: 'boolean',
        description: 'Whether the axes are visible or not'
      }
    }
  },
  default: (panel: JupyterCadPanel) => {
    return {
      Size: panel.axes?.size ?? 5,
      Visible: panel.axes?.visible ?? true
    };
  },
  syncData: (panel: JupyterCadPanel) => {
    return (props: IDict) => {
      const { Size, Visible } = props;
      panel.axes = {
        size: Size,
        visible: Visible
      };
    };
  }
};

const EXPLODED_VIEW_FORM = {
  title: 'Exploded View Settings',
  schema: {
    type: 'object',
    required: ['Enabled', 'Factor'],
    additionalProperties: false,
    properties: {
      Enabled: {
        type: 'boolean',
        description: 'Whether the exploded view is enabled or not'
      },
      Factor: {
        type: 'number',
        description: 'The exploded view factor'
      }
    }
  },
  default: (panel: JupyterCadPanel) => {
    return {
      Enabled: panel.explodedView?.enabled ?? false,
      Factor: panel.explodedView?.factor ?? 0.5
    };
  },
  syncData: (panel: JupyterCadPanel) => {
    return (props: IDict) => {
      const { Enabled, Factor } = props;
      panel.explodedView = {
        enabled: Enabled,
        factor: Factor
      };
    };
  }
};

const CAMERA_FORM = {
  title: 'Camera Settings',
  schema: {
    type: 'object',
    required: ['Type'],
    additionalProperties: false,
    properties: {
      Type: {
        title: 'Projection',
        description: 'The projection type',
        type: 'string',
        enum: ['Perspective', 'Orthographic']
      }
    }
  },
  default: (panel: JupyterCadPanel) => {
    return {
      Type: panel.cameraSettings?.type ?? 'Perspective'
    };
  },
  syncData: (panel: JupyterCadPanel) => {
    return (props: IDict) => {
      const { Type } = props;
      panel.cameraSettings = {
        type: Type
      };
    };
  }
};

const EXPORT_FORM = {
  title: 'Export to .jcad',
  schema: {
    type: 'object',
    required: ['Name'],
    additionalProperties: false,
    properties: {
      Name: {
        title: 'File name',
        description: 'The exported file name',
        type: 'string'
      }
    }
  },
  default: (model: IJupyterCadModel) => {
    return {
      Name: PathExt.basename(model.filePath).replace(
        PathExt.extname(model.filePath),
        '.jcad'
      )
    };
  },
  syncData: (model: IJupyterCadModel) => {
    return (props: IDict) => {
      const endpoint = model.sharedModel?.toJcadEndpoint;
      if (!endpoint) {
        showErrorMessage('Error', 'Missing endpoint.');
        return;
      }
      const { Name } = props;
      requestAPI<{ done: boolean }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          path: model.filePath,
          newName: Name
        })
      });
    };
  }
};

function loadKeybindings(commands: CommandRegistry, keybindings: any[]) {
  keybindings.forEach(binding => {
    commands.addKeyBinding({
      command: binding.command,
      keys: binding.keys,
      selector: binding.selector
    });
  });
}

function getSelectedObjectId(widget: JupyterCadOutputwidget): string {
  const selected = widget.model.sharedModel.awareness.getLocalState()?.selected;

  if (selected && selected.value) {
    const selectedKey = Object.keys(selected.value)[0];
    const selectedItem = selected.value[selectedKey];
    if (selectedItem.type === 'edge' && selectedItem.parent) {
      return selectedItem.parent;
    }
    return selectedKey;
  }
  return '';
}

/**
 * Add the FreeCAD commands to the application's command registry.
 */
export function addCommands(
  app: JupyterFrontEnd,
  tracker: WidgetTracker<JupyterCadOutputwidget>,
  translator: ITranslator,
  formSchemaRegistry: IJCadFormSchemaRegistry,
  workerRegistry: IJCadWorkerRegistry,
  completionProviderManager: ICompletionProviderManager | undefined
): void {
  workerRegistry.getWorker;
  const trans = translator.load('jupyterlab');
  const { commands } = app;
  Private.updateFormSchema(formSchemaRegistry);

  commands.addCommand(CommandIDs.toggleConsole, {
    label: trans.__('Toggle console'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    execute: async () => await Private.toggleConsole(tracker)
  });
  commands.addCommand(CommandIDs.executeConsole, {
    label: trans.__('Execute console'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    execute: () => Private.executeConsole(tracker)
  });
  commands.addCommand(CommandIDs.removeConsole, {
    label: trans.__('Remove console'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    execute: () => Private.removeConsole(tracker)
  });

  commands.addCommand(CommandIDs.invokeCompleter, {
    label: trans.__('Display the completion helper.'),
    execute: () => {
      const currentWidget = tracker.currentWidget;
      if (!currentWidget || !completionProviderManager) {
        return;
      }
      const id = currentWidget.content.consolePanel?.id;
      if (id) {
        return completionProviderManager.invoke(id);
      }
    }
  });

  commands.addCommand(CommandIDs.selectCompleter, {
    label: trans.__('Select the completion suggestion.'),
    execute: () => {
      const currentWidget = tracker.currentWidget;
      if (!currentWidget || !completionProviderManager) {
        return;
      }
      const id = currentWidget.content.consolePanel?.id;
      if (id) {
        return completionProviderManager.select(id);
      }
    }
  });
  commands.addCommand(CommandIDs.redo, {
    label: trans.__('Redo'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    execute: args => {
      const current = tracker.currentWidget;

      if (current) {
        return current.model.sharedModel.redo();
      }
    },
    icon: redoIcon
  });

  commands.addCommand(CommandIDs.undo, {
    label: trans.__('Undo'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    execute: args => {
      const current = tracker.currentWidget;

      if (current) {
        return current.model.sharedModel.undo();
      }
    },
    icon: undoIcon
  });
  commands.addCommand(CommandIDs.newSketch, {
    label: trans.__('New Sketch'),
    iconClass: 'fa fa-pencil',
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    execute: async args => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const props = {
        sharedModel: current.model.sharedModel,
        closeCallback: {
          handler: () => {
            /* Awful hack to allow the body can close the dialog*/
          }
        }
      };
      const dialog = new SketcherDialog(props);
      props.closeCallback.handler = () => dialog.close();
      await dialog.launch();
    }
  });

  commands.addCommand(CommandIDs.removeObject, {
    label: trans.__('Remove Object'),
    isEnabled: () => {
      const current = tracker.currentWidget;
      return current ? current.model.sharedModel.editable : false;
    },
    execute: () => {
      const current = tracker.currentWidget;
      if (!current) {
        return;
      }

      const objectId = getSelectedObjectId(current);
      if (!objectId) {
        console.warn('No object is selected.');
        return;
      }
      const sharedModel = current.model.sharedModel;

      handleRemoveObject(objectId, sharedModel, () =>
        sharedModel.awareness.setLocalStateField('selected', {})
      );
    }
  });

  commands.addCommand(CommandIDs.newBox, {
    label: trans.__('New Box'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: boxIcon,
    execute: Private.createPart('box', tracker)
  });

  commands.addCommand(CommandIDs.newCylinder, {
    label: trans.__('New Cylinder'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: cylinderIcon,
    execute: Private.createPart('cylinder', tracker)
  });

  commands.addCommand(CommandIDs.newSphere, {
    label: trans.__('New Sphere'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: sphereIcon,
    execute: Private.createPart('sphere', tracker)
  });

  commands.addCommand(CommandIDs.newCone, {
    label: trans.__('New Cone'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: coneIcon,
    execute: Private.createPart('cone', tracker)
  });

  commands.addCommand(CommandIDs.newTorus, {
    label: trans.__('New Torus'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: torusIcon,
    execute: Private.createPart('torus', tracker)
  });

  commands.addCommand(CommandIDs.extrusion, {
    label: trans.__('Extrusion'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: extrusionIcon,
    execute: Private.executeOperator('extrusion', tracker)
  });

  commands.addCommand(CommandIDs.cut, {
    label: trans.__('Cut'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: cutIcon,
    execute: Private.executeOperator('cut', tracker)
  });

  commands.addCommand(CommandIDs.union, {
    label: trans.__('Union'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: unionIcon,
    execute: Private.executeOperator('union', tracker)
  });

  commands.addCommand(CommandIDs.intersection, {
    label: trans.__('Intersection'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: intersectionIcon,
    execute: Private.executeOperator('intersection', tracker)
  });

  commands.addCommand(CommandIDs.wireframe, {
    label: trans.__('Toggle Wireframe'),
    isEnabled: () => {
      return tracker.currentWidget !== null;
    },
    isToggled: () => {
      const current = tracker.currentWidget?.content;
      return current?.wireframe || false;
    },
    execute: async () => {
      const current = tracker.currentWidget?.content;

      if (!current) {
        return;
      }
      current.wireframe = !current.wireframe;
      commands.notifyCommandChanged(CommandIDs.wireframe);
    },
    icon: wireframeIcon
  });

  tracker.currentChanged.connect(() => {
    commands.notifyCommandChanged(CommandIDs.wireframe);
  });

  commands.addCommand(CommandIDs.transform, {
    label: trans.__('Toggle Transform Controls'),
    isEnabled: () => {
      const current = tracker.currentWidget;

      if (!current || !tracker.currentWidget.model.sharedModel.editable) {
        return false;
      }

      const viewSettings = tracker.currentWidget.content.currentViewModel
        .viewSettings as JSONObject;
      return viewSettings.explodedView
        ? !(viewSettings.explodedView as ExplodedView).enabled
        : true;
    },
    isToggled: () => {
      const current = tracker.currentWidget?.content;
      return current?.transform || false;
    },
    execute: async () => {
      const current = tracker.currentWidget?.content;

      if (!current) {
        return;
      }

      current.transform = !current.transform;
      commands.notifyCommandChanged(CommandIDs.transform);
    },
    icon: transformIcon
  });

  tracker.currentChanged.connect(() => {
    commands.notifyCommandChanged(CommandIDs.transform);
  });

  commands.addCommand(CommandIDs.chamfer, {
    label: trans.__('Make chamfer'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: chamferIcon,
    execute: Private.executeOperator('chamfer', tracker)
  });

  commands.addCommand(CommandIDs.fillet, {
    label: trans.__('Make fillet'),
    isEnabled: () => {
      return tracker.currentWidget
        ? tracker.currentWidget.model.sharedModel.editable
        : false;
    },
    icon: filletIcon,
    execute: Private.executeOperator('fillet', tracker)
  });

  commands.addCommand(CommandIDs.updateAxes, {
    label: trans.__('Axes Helper'),
    isEnabled: () => Boolean(tracker.currentWidget),
    icon: axesIcon,
    execute: async () => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const dialog = new FormDialog({
        model: current.model,
        title: AXES_FORM.title,
        schema: AXES_FORM.schema,
        sourceData: AXES_FORM.default(current.content),
        syncData: AXES_FORM.syncData(current.content),
        cancelButton: true
      });
      await dialog.launch();
    }
  });

  commands.addCommand(CommandIDs.updateExplodedView, {
    label: trans.__('Exploded View'),
    isEnabled: () => Boolean(tracker.currentWidget),
    icon: explodedViewIcon,
    isToggled: () => {
      const viewSettings = tracker.currentWidget?.content.currentViewModel
        .viewSettings as JSONObject;
      return viewSettings?.explodedView
        ? (viewSettings.explodedView as ExplodedView).enabled
        : false;
    },
    execute: async () => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const dialog = new FormDialog({
        model: current.model,
        title: EXPLODED_VIEW_FORM.title,
        schema: EXPLODED_VIEW_FORM.schema,
        sourceData: EXPLODED_VIEW_FORM.default(current.content),
        syncData: EXPLODED_VIEW_FORM.syncData(current.content),
        cancelButton: true
      });
      await dialog.launch();

      commands.notifyCommandChanged(CommandIDs.updateExplodedView);

      // Notify change so that toggle button for transform disables if needed
      commands.notifyCommandChanged(CommandIDs.transform);
    }
  });

  commands.addCommand(CommandIDs.updateCameraSettings, {
    label: trans.__('Camera Settings'),
    isEnabled: () => Boolean(tracker.currentWidget),
    iconClass: 'fa fa-camera',
    execute: async () => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const dialog = new FormDialog({
        model: current.model,
        title: CAMERA_FORM.title,
        schema: CAMERA_FORM.schema,
        sourceData: CAMERA_FORM.default(current.content),
        syncData: CAMERA_FORM.syncData(current.content),
        cancelButton: true
      });
      await dialog.launch();
    }
  });

  commands.addCommand(CommandIDs.updateClipView, {
    label: trans.__('Clipping'),
    isEnabled: () => {
      return Boolean(tracker.currentWidget);
    },
    isToggled: () => {
      const current = tracker.currentWidget?.content;
      return current?.clipView?.enabled || false;
    },
    icon: clippingIcon,
    execute: async () => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const panel = current.content;
      panel.clipView = panel.clipView || {
        enabled: false,
        showClipPlane: true
      };

      panel.clipView.enabled = !panel.clipView.enabled;

      const { enabled, showClipPlane } = panel.clipView;
      panel.clipView = {
        enabled: enabled,
        showClipPlane: showClipPlane
      };
      commands.notifyCommandChanged(CommandIDs.updateClipView);
    }
  });

  tracker.currentChanged.connect(() => {
    commands.notifyCommandChanged(CommandIDs.updateClipView);
  });

  commands.addCommand(CommandIDs.splitScreen, {
    label: trans.__('Split screen'),
    isEnabled: () => Boolean(tracker.currentWidget),
    icon: filterIcon,
    execute: async () => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }
      if (current.content.splitScreen) {
        current.content.splitScreen = {
          enabled: !current.content.splitScreen.enabled
        };
      }
    }
  });

  commands.addCommand(CommandIDs.exportJcad, {
    label: trans.__('Export to .jcad'),
    isEnabled: () => {
      return Boolean(tracker.currentWidget?.model?.sharedModel?.toJcadEndpoint);
    },
    iconClass: 'fa fa-file-export',
    execute: async () => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const dialog = new FormDialog({
        model: current.model,
        title: EXPORT_FORM.title,
        schema: EXPORT_FORM.schema,
        sourceData: EXPORT_FORM.default(tracker.currentWidget?.model),
        syncData: EXPORT_FORM.syncData(tracker.currentWidget?.model),
        cancelButton: true
      });
      await dialog.launch();
    }
  });
  commands.addCommand(CommandIDs.copyObject, {
    label: trans.__('Copy Object'),
    isEnabled: () => {
      const current = tracker.currentWidget;
      return current ? current.model.sharedModel.editable : false;
    },
    execute: () => {
      const current = tracker.currentWidget;
      if (!current) {
        return;
      }

      const objectId = getSelectedObjectId(current);
      const sharedModel = current.model.sharedModel;
      const objectData = sharedModel.getObjectByName(objectId);

      if (!objectData) {
        console.warn('Could not retrieve object data.');
        return;
      }

      current.model.setCopiedObject(objectData);
    }
  });
  commands.addCommand(CommandIDs.pasteObject, {
    label: trans.__('Paste Object'),
    isEnabled: () => {
      const current = tracker.currentWidget;
      const clipboard = current?.model.getCopiedObject();
      const editable = current?.model.sharedModel.editable;
      return !!(current && clipboard && editable);
    },
    execute: () => {
      const current = tracker.currentWidget;
      if (!current) {
        return;
      }

      const sharedModel = current.model.sharedModel;
      const copiedObject = current.model.getCopiedObject();
      if (!copiedObject) {
        console.error('No object in clipboard to paste.');
        return;
      }

      const clipboard = copiedObject;

      const originalName = clipboard.name || 'Unnamed Object';
      let newName = originalName;

      let counter = 1;
      while (sharedModel.objects.some(obj => obj.name === newName)) {
        newName = `${originalName} Copy${counter > 1 ? ` ${counter}` : ''}`;
        counter++;
      }
      const jcadModel = current.model;
      const newObject = {
        ...clipboard,
        name: newName,
        visible: true
      };
      sharedModel.addObject(newObject);
      jcadModel.syncSelected({ [newObject.name]: { type: 'shape' } }, uuid());
    }
  });

  loadKeybindings(commands, keybindings);
}

/**
 * The command IDs used by the FreeCAD plugin.
 */
export namespace CommandIDs {
  export const redo = 'jupytercad:redo';
  export const undo = 'jupytercad:undo';

  export const newSketch = 'jupytercad:sketch';

  export const removeObject = 'jupytercad:removeObject';

  export const newBox = 'jupytercad:newBox';
  export const newCylinder = 'jupytercad:newCylinder';
  export const newSphere = 'jupytercad:newSphere';
  export const newCone = 'jupytercad:newCone';
  export const newTorus = 'jupytercad:newTorus';

  export const cut = 'jupytercad:cut';
  export const extrusion = 'jupytercad:extrusion';
  export const union = 'jupytercad:union';
  export const intersection = 'jupytercad:intersection';
  export const wireframe = 'jupytercad:wireframe';
  export const transform = 'jupytercad:transform';

  export const copyObject = 'jupytercad:copyObject';
  export const pasteObject = 'jupytercad:pasteObject';

  export const chamfer = 'jupytercad:chamfer';
  export const fillet = 'jupytercad:fillet';

  export const updateAxes = 'jupytercad:updateAxes';
  export const updateExplodedView = 'jupytercad:updateExplodedView';
  export const updateCameraSettings = 'jupytercad:updateCameraSettings';
  export const updateClipView = 'jupytercad:updateClipView';

  export const splitScreen = 'jupytercad:splitScreen';
  export const exportJcad = 'jupytercad:exportJcad';

  export const toggleConsole = 'jupytercad:toggleConsole';
  export const invokeCompleter = 'jupytercad:invokeConsoleCompleter';
  export const removeConsole = 'jupytercad:removeConsole';
  export const executeConsole = 'jupytercad:executeConsole';
  export const selectCompleter = 'jupytercad:selectConsoleCompleter';
}

namespace Private {
  export const FORM_SCHEMA = {};

  export function updateFormSchema(
    formSchemaRegistry: IJCadFormSchemaRegistry
  ) {
    if (Object.keys(FORM_SCHEMA).length > 0) {
      return;
    }
    const formSchema = formSchemaRegistry.getSchemas();
    formSchema.forEach((val, key) => {
      if (key === 'Placement of the box') {
        return;
      }
      const value = (FORM_SCHEMA[key] = JSON.parse(JSON.stringify(val)));
      value['required'] = ['Name', ...value['required']];
      value['properties'] = {
        Name: { type: 'string', description: 'The Name of the Object' },
        ...value['properties']
      };
    });
  }

  export function createPart(
    part: keyof typeof PARTS,
    tracker: WidgetTracker<JupyterCadOutputwidget>
  ) {
    return async (args: any) => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const value = PARTS[part];

      current.model.syncFormData(value);

      const syncSelectedField = (
        id: string | null,
        value: any,
        parentType: 'panel' | 'dialog'
      ): void => {
        let property: string | null = null;
        if (id) {
          const prefix = id.split('_')[0];
          property = id.substring(prefix.length);
        }
        current.model.syncSelectedPropField({
          id: property,
          value,
          parentType
        });
      };

      const dialog = new FormDialog({
        model: current.model,
        title: value.title,
        sourceData: value.default(current.model),
        schema: FORM_SCHEMA[value.shape],
        syncData: async (props: IDict) => {
          const { Name, ...parameters } = props;
          const objectModel: IJCadObject = {
            shape: value.shape as Parts,
            parameters,
            visible: true,
            name: Name
          };

          const jcadModel = current.model;

          if (jcadModel) {
            const sharedModel = jcadModel.sharedModel;
            if (!sharedModel.objectExists(objectModel.name)) {
              // Try a dry run with the update content to verify its feasibility
              const currentJcadContent = current.model.getContent();
              const updatedContent: IJCadContent = {
                ...currentJcadContent,
                objects: [...currentJcadContent.objects, objectModel]
              };

              const dryRunResult = await dryRunCheck({
                jcadContent: updatedContent,
                mainView: current.content.currentViewModel,
                requestedOperator: value.shape
              });
              if (!dryRunResult) {
                return;
              }
              const objMeta = dryRunResult.shapeMetadata?.[objectModel.name];
              if (objMeta) {
                objectModel.shapeMetadata = objMeta;
              }
              sharedModel.addObject(objectModel);
              jcadModel.syncSelected(
                { [objectModel.name]: { type: 'shape' } },
                uuid()
              );
            } else {
              showErrorMessage(
                'The object already exists',
                'There is an existing object with the same name.'
              );
            }
          }
        },
        cancelButton: () => {
          current.model.syncFormData(undefined);
        },
        syncSelectedPropField: syncSelectedField
      });
      await dialog.launch();
    };
  }

  export function executeOperator(
    operator: keyof typeof OPERATORS,
    tracker: WidgetTracker<JupyterCadOutputwidget>
  ) {
    return async (args: any) => {
      const current = tracker.currentWidget;

      if (!current) {
        return;
      }

      const op = OPERATORS[operator];

      // Fill form schema with available objects
      const form_schema = JSON.parse(JSON.stringify(FORM_SCHEMA[op.shape]));
      const allObjects = current.model.getAllObject().map(o => o.name);
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

      const dialog = new FormDialog({
        model: current.model,
        title: op.title,
        sourceData: op.default(current.model),
        schema: form_schema,
        syncData: op.syncData(current),
        cancelButton: true
      });
      await dialog.launch();
    };
  }

  export function executeConsole(
    tracker: WidgetTracker<JupyterCadOutputwidget>
  ): void {
    const current = tracker.currentWidget;

    if (!current || !(current instanceof JupyterCadDocumentWidget)) {
      return;
    }
    current.content.executeConsole();
  }

  export function removeConsole(
    tracker: WidgetTracker<JupyterCadOutputwidget>
  ): void {
    const current = tracker.currentWidget;

    if (!current || !(current instanceof JupyterCadDocumentWidget)) {
      return;
    }
    current.content.removeConsole();
  }

  export async function toggleConsole(
    tracker: JupyterCadTracker
  ): Promise<void> {
    const current = tracker.currentWidget;

    if (!current || !(current instanceof JupyterCadDocumentWidget)) {
      return;
    }
    await current.content.toggleConsole(current.model.filePath);
  }
}
