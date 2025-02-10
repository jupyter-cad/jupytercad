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

import { JupyterCadStlModelFactory } from './modelfactory';
import { JupyterCadDocumentWidgetFactory } from '../factory';
import { JupyterCadStlDoc } from './model';
import { stlIcon } from '@jupytercad/base';

const FACTORY = 'JupyterCAD STL Viewer';

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
    modelName: 'jupytercad-stlmodel',
    fileTypes: ['stl'],
    defaultFor: ['stl'],
    tracker,
    commands: app.commands,
    workerRegistry,
    externalCommandRegistry
  });
  // Registering the widget factory
  app.docRegistry.addWidgetFactory(widgetFactory);

  // Creating and registering the model factory for our custom DocumentModel
  const modelFactory = new JupyterCadStlModelFactory();
  app.docRegistry.addModelFactory(modelFactory);
  // register the filetype
  app.docRegistry.addFileType({
    name: 'stl',
    displayName: 'STL',
    mimeTypes: ['text/plain'],
    extensions: ['.stl', '.STL'],
    fileFormat: 'text',
    contentType: 'stl',
    icon: stlIcon
  });

  const stlSharedModelFactory: SharedDocumentFactory = () => {
    return new JupyterCadStlDoc();
  };
  if (drive) {
    drive.sharedModelFactory.registerDocumentFactory(
      'stl',
      stlSharedModelFactory
    );
  }

  widgetFactory.widgetCreated.connect((sender, widget) => {
    widget.title.icon = stlIcon;
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

const stlPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupytercad:stlplugin',
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

export default stlPlugin;
