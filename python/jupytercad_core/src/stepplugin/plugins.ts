import {
  ICollaborativeDrive,
  SharedDocumentFactory
} from '@jupyter/docprovider';
import {
  IJCadWorkerRegistry,
  IJCadWorkerRegistryToken,
  IJupyterCadDocTracker,
  IJupyterCadWidget,
  JupyterCadStepDoc
} from '@jupytercad/schema';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  IThemeManager,
  WidgetTracker
} from '@jupyterlab/apputils';

import { JupyterCadJcadStepModelFactory } from './modelfactory';
import { JupyterCadWidgetFactory } from '../factory';

const FACTORY = 'JupyterCAD STEP Viewer';


const activate = (
  app: JupyterFrontEnd,
  tracker: WidgetTracker<IJupyterCadWidget>,
  themeManager: IThemeManager,
  drive: ICollaborativeDrive,
  workerRegistry: IJCadWorkerRegistry,
): void => {
  const widgetFactory = new JupyterCadWidgetFactory({
    name: FACTORY,
    modelName: 'jupytercad-stepmodel',
    fileTypes: ['step'],
    defaultFor: ['step'],
    tracker,
    commands: app.commands,
    workerRegistry
  });
  // Registering the widget factory
  app.docRegistry.addWidgetFactory(widgetFactory);

  // Creating and registering the model factory for our custom DocumentModel
  const modelFactory = new JupyterCadJcadStepModelFactory();
  app.docRegistry.addModelFactory(modelFactory);
  // register the filetype
  app.docRegistry.addFileType({
    name: 'step',
    displayName: 'STEP',
    mimeTypes: ['text/json'],
    extensions: ['.step', '.STEP'],
    fileFormat: 'text',
    contentType: 'step'
  });

  const stepSharedModelFactory: SharedDocumentFactory = () => {
    return new JupyterCadStepDoc();
  };
  drive.sharedModelFactory.registerDocumentFactory(
    'step',
    stepSharedModelFactory
  );

  widgetFactory.widgetCreated.connect((sender, widget) => {
    widget.context.pathChanged.connect(() => {
      tracker.save(widget);
    });
    themeManager.themeChanged.connect((_, changes) =>
      widget.context.model.themeChanged.emit(changes)
    );
    tracker.add(widget);
    app.shell.activateById('jupytercad::leftControlPanel');
    app.shell.activateById('jupytercad::rightControlPanel');
  });
};

const stepPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupytercad:stepplugin',
  requires: [
    IJupyterCadDocTracker,
    IThemeManager,
    ICollaborativeDrive,
    IJCadWorkerRegistryToken
  ],
  autoStart: true,
  activate
};

export default stepPlugin;
