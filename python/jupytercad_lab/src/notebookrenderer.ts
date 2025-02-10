import { ICollaborativeDrive } from '@jupyter/collaborative-drive';
import { JupyterCadPanel } from '@jupytercad/base';
import {
  IJCadWorkerRegistry,
  IJCadWorkerRegistryToken,
  IJupyterCadDoc,
  JupyterCadModel
} from '@jupytercad/schema';

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Contents } from '@jupyterlab/services';
import { MessageLoop } from '@lumino/messaging';
import { Panel, Widget } from '@lumino/widgets';
import * as Y from 'yjs';
import {
  IJupyterYWidget,
  IJupyterYWidgetManager,
  JupyterYModel
} from 'yjs-widgets';

export interface ICommMetadata {
  create_ydoc: boolean;
  path: string;
  format: string;
  contentType: string;
  ymodel_name: string;
}

export const CLASS_NAME = 'jupytercad-notebook-widget';

export class YJupyterCADModel extends JupyterYModel {
  jupyterCADModel: JupyterCadModel;
}

export class YJupyterCADLuminoWidget extends Panel {
  constructor(options: {
    model: JupyterCadModel;
    workerRegistry: IJCadWorkerRegistry;
  }) {
    super();

    this.addClass(CLASS_NAME);
    this._jcadWidget = new JupyterCadPanel(options);
    this.addWidget(this._jcadWidget);
  }

  onResize = (): void => {
    if (this._jcadWidget) {
      MessageLoop.sendMessage(
        this._jcadWidget,
        Widget.ResizeMessage.UnknownSize
      );
    }
  };

  private _jcadWidget: JupyterCadPanel;
}

export const notebookRenderePlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupytercad:yjswidget-plugin',
  autoStart: true,
  requires: [IJCadWorkerRegistryToken],
  optional: [IJupyterYWidgetManager, ICollaborativeDrive],
  activate: (
    app: JupyterFrontEnd,
    workerRegistry: IJCadWorkerRegistry,
    yWidgetManager?: IJupyterYWidgetManager,
    drive?: ICollaborativeDrive
  ): void => {
    if (!yWidgetManager) {
      console.error('Missing IJupyterYWidgetManager token!');
      return;
    }
    if (!drive) {
      console.error('Missing ICollaborativeDrive token!');
      return;
    }
    class YJupyterCADModelFactory extends YJupyterCADModel {
      ydocFactory(commMetadata: ICommMetadata): Y.Doc {
        const { path, format, contentType } = commMetadata;
        const fileFormat = format as Contents.FileFormat;

        const sharedModel = drive!.sharedModelFactory.createNew({
          path,
          format: fileFormat,
          contentType,
          collaborative: true
        })!;
        const jupyterCadDoc = sharedModel as IJupyterCadDoc;
        this.jupyterCADModel = new JupyterCadModel({
          sharedModel: jupyterCadDoc
        });

        return this.jupyterCADModel.sharedModel.ydoc;
      }
    }

    class YJupyterCadOutputwidget implements IJupyterYWidget {
      constructor(yModel: YJupyterCADModel, node: HTMLElement) {
        this.yModel = yModel;
        this.node = node;

        const widget = new YJupyterCADLuminoWidget({
          model: yModel.jupyterCADModel,
          workerRegistry
        });
        // Widget.attach(widget, node);

        MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
        node.appendChild(widget.node);
        MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
      }

      readonly yModel: YJupyterCADModel;
      readonly node: HTMLElement;
    }

    yWidgetManager.registerWidget(
      '@jupytercad:widget',
      YJupyterCADModelFactory,
      YJupyterCadOutputwidget
    );
  }
};
