import {
  ICollaborativeDrive,
  SharedDocumentFactory
} from '@jupyter/collaborative-drive';
import {
  IJCadWorkerRegistry,
  IJCadWorkerRegistryToken,
  IJupyterCadDocTracker,
  IJupyterCadOutputwidget,
  IJCadExternalCommandRegistry,
  IJCadExternalCommandRegistryToken
} from '@jupytercad/schema';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IThemeManager, WidgetTracker } from '@jupyterlab/apputils';

import { JupyterCadStepModelFactory } from './modelfactory';
import { JupyterCadDocumentWidgetFactory } from '../factory';
import { JupyterCadStepDoc } from './model';
import { stpIcon } from '@jupytercad/base';

const FACTORY = 'JupyterCAD STEP Viewer';

const activate = (
  app: JupyterFrontEnd,
  tracker: WidgetTracker<IJupyterCadOutputwidget>,
  themeManager: IThemeManager,
  workerRegistry: IJCadWorkerRegistry,
  externalCommandRegistry: IJCadExternalCommandRegistry,
  drive: ICollaborativeDrive | null
): void => {
  const widgetFactory = new JupyterCadDocumentWidgetFactory({
    name: FACTORY,
    modelName: 'jupytercad-stepmodel',
    fileTypes: ['step'],
    defaultFor: ['step'],
    tracker,
    commands: app.commands,
    workerRegistry,
    externalCommandRegistry
  });
  // Registering the widget factory
  app.docRegistry.addWidgetFactory(widgetFactory);

  // Creating and registering the model factory for our custom DocumentModel
  const modelFactory = new JupyterCadStepModelFactory();
  app.docRegistry.addModelFactory(modelFactory);
  // register the filetype
  app.docRegistry.addFileType({
    name: 'step',
    displayName: 'STEP',
    mimeTypes: ['text/plain'],
    extensions: ['.step', '.STEP'],
    fileFormat: 'text',
    contentType: 'step',
    icon: stpIcon
  });

  const stepSharedModelFactory: SharedDocumentFactory = () => {
    return new JupyterCadStepDoc();
  };
  if (drive) {
    drive.sharedModelFactory.registerDocumentFactory(
      'step',
      stepSharedModelFactory
    );
  }

  widgetFactory.widgetCreated.connect((sender, widget) => {
    widget.title.icon = stpIcon;
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
    IJCadWorkerRegistryToken,
    IJCadExternalCommandRegistryToken
  ],
  optional: [ICollaborativeDrive],
  autoStart: true,
  activate
};

export default stepPlugin;
