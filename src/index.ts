import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { WidgetTracker } from '@jupyterlab/apputils';
import { ITranslator } from '@jupyterlab/translation';
import { IMainMenu } from '@jupyterlab/mainmenu';

import fcplugin from './fcplugin/plugins';
import jcadPlugin from './jcadplugin/plugins';
import { JupyterCadModel } from './model';
import { ControlPanelModel } from './panelview/model';
import { LeftPanelWidget } from './panelview/leftpanel';
import { RightPanelWidget } from './panelview/rightpanel';
import { IJupyterCadDocTracker, IJupyterCadTracker } from './token';
import { jcLightIcon } from './tools';
import { JupyterCadWidget } from './widget';

const NAME_SPACE = 'jupytercad';

/**
 * The command IDs used by the FreeCAD plugin.
 */
namespace CommandIDs {
  export const redo = 'jupytercad:redo';
  export const undo = 'jupytercad:undo';
}

const plugin: JupyterFrontEndPlugin<IJupyterCadTracker> = {
  id: 'jupytercad:plugin',
  autoStart: true,
  requires: [IMainMenu, ITranslator],
  provides: IJupyterCadDocTracker,
  activate: (app: JupyterFrontEnd, mainMenu: IMainMenu, translator: ITranslator): IJupyterCadTracker => {
    const tracker = new WidgetTracker<JupyterCadWidget>({
      namespace: NAME_SPACE
    });
    JupyterCadModel.worker = new Worker(
      new URL('./worker', (import.meta as any).url)
    );

    console.log('JupyterLab extension jupytercad is activated!');

    /**
     * Whether there is an active notebook.
     */
    const isEnabled = (): boolean => {
      return (
        tracker.currentWidget !== null &&
        tracker.currentWidget === app.shell.currentWidget
      );
    };

    addCommands(app, tracker, translator, isEnabled);
    populateMenus(mainMenu, isEnabled);
    
    return tracker;
  }
};

const controlPanel: JupyterFrontEndPlugin<void> = {
  id: 'jupytercad:controlpanel',
  autoStart: true,
  requires: [ILayoutRestorer, IJupyterCadDocTracker],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer,
    tracker: IJupyterCadTracker
  ) => {
    const controlModel = new ControlPanelModel({ tracker });

    const leftControlPanel = new LeftPanelWidget({ model: controlModel });
    leftControlPanel.id = 'jupytercad::leftControlPanel';
    leftControlPanel.title.caption = 'JupyterCad Control Panel';
    leftControlPanel.title.icon = jcLightIcon;

    const rightControlPanel = new RightPanelWidget({ model: controlModel });
    rightControlPanel.id = 'jupytercad::rightControlPanel';
    rightControlPanel.title.caption = 'JupyterCad Control Panel';
    rightControlPanel.title.icon = jcLightIcon;

    if (restorer) {
      restorer.add(leftControlPanel, NAME_SPACE);
      restorer.add(rightControlPanel, NAME_SPACE);
    }
    app.shell.add(leftControlPanel, 'left', { rank: 2000 });
    app.shell.add(rightControlPanel, 'right', { rank: 2000 });
  }
};

export default [plugin, controlPanel, fcplugin, jcadPlugin];


/**
 * Add the FreeCAD commands to the application's command registry.
 */
function addCommands(
  app: JupyterFrontEnd,
  tracker: WidgetTracker<JupyterCadWidget>,
  translator: ITranslator,
  isEnabled: () => boolean
): void {
  const trans = translator.load('jupyterlab');
  const { commands } = app;

  commands.addCommand(CommandIDs.redo, {
    label: trans.__('Redo'),
    isEnabled: () => isEnabled() && tracker.currentWidget!.context.model.sharedModel.canRedo(),
    execute: args => {
      const current = tracker.currentWidget;

      if (current) {
        return current.context.model.sharedModel.redo();
      }
    }
  });

  commands.addCommand(CommandIDs.undo, {
    label: trans.__('Undo'),
    isEnabled: () => isEnabled() && tracker.currentWidget!.context.model.sharedModel.canUndo(),
    execute: args => {
      const current = tracker.currentWidget;

      if (current) {
        return current.context.model.sharedModel.undo();
      }
    }
  });
}

/**
 * Populates the application menus for the notebook.
 */
function populateMenus(
  mainMenu: IMainMenu,
  isEnabled: () => boolean
): void {
  // Add undo/redo hooks to the edit menu.
  mainMenu.editMenu.undoers.redo.add({
    id: CommandIDs.redo,
    isEnabled
  });
  mainMenu.editMenu.undoers.undo.add({
    id: CommandIDs.undo,
    isEnabled
  });
}