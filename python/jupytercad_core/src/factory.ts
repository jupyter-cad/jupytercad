import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';
import {
  JupyterCadModel,
  IJCadWorkerRegistry,
  IJCadExternalCommandRegistry,
  IJupyterCadTracker
} from '@jupytercad/schema';
import { ABCWidgetFactory, DocumentRegistry } from '@jupyterlab/docregistry';
import { CommandRegistry } from '@lumino/commands';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { IEditorMimeTypeService } from '@jupyterlab/codeeditor';
import {
  JupyterCadPanel,
  JupyterCadDocumentWidget,
  ToolbarWidget
} from '@jupytercad/base';
import { ServiceManager } from '@jupyterlab/services';

interface IOptions extends DocumentRegistry.IWidgetFactoryOptions {
  tracker: IJupyterCadTracker;
  commands: CommandRegistry;
  workerRegistry: IJCadWorkerRegistry;
  externalCommandRegistry: IJCadExternalCommandRegistry;
  manager?: ServiceManager.IManager;
  contentFactory?: ConsolePanel.IContentFactory;
  mimeTypeService?: IEditorMimeTypeService;
  rendermime?: IRenderMimeRegistry;
  consoleTracker?: IConsoleTracker;
  backendCheck?: () => boolean;
}

export class JupyterCadDocumentWidgetFactory extends ABCWidgetFactory<
  JupyterCadDocumentWidget,
  JupyterCadModel
> {
  constructor(private options: IOptions) {
    const { backendCheck, externalCommandRegistry, ...rest } = options;
    super(rest);
    this._backendCheck = backendCheck;
    this._commands = options.commands;
    this._workerRegistry = options.workerRegistry;
    this._externalCommandRegistry = externalCommandRegistry;
  }

  /**
   * Create a new widget given a context.
   *
   * @param context Contains the information of the file
   * @returns The widget
   */
  protected createNewWidget(
    context: DocumentRegistry.IContext<JupyterCadModel>
  ): JupyterCadDocumentWidget {
    if (this._backendCheck) {
      const checked = this._backendCheck();
      if (!checked) {
        throw new Error('Requested backend is not installed');
      }
    }
    const { model } = context;
    model.filePath = context.localPath;
    const content = new JupyterCadPanel({
      model,
      workerRegistry: this._workerRegistry,
      manager: this.options.manager,
      contentFactory: this.options.contentFactory,
      mimeTypeService: this.options.mimeTypeService,
      rendermime: this.options.rendermime,
      consoleTracker: this.options.consoleTracker,
      commandRegistry: this.options.commands
    });
    const toolbar = new ToolbarWidget({
      commands: this._commands,
      model,
      externalCommands: this._externalCommandRegistry.getCommands()
    });
    return new JupyterCadDocumentWidget({ context, content, toolbar });
  }

  private _commands: CommandRegistry;
  private _workerRegistry: IJCadWorkerRegistry;
  private _externalCommandRegistry: IJCadExternalCommandRegistry;
  private _backendCheck?: () => boolean;
}
