import {
  JupyterCadDoc,
  IJupyterCadTracker,
  IJCadFormSchemaRegistry,
  IJupyterCadModel
} from '@jupytercad/schema';
import { SidePanel } from '@jupyterlab/ui-components';

import { IControlPanelModel } from '../types';
import { ControlPanelHeader } from './header';
import { ObjectTree } from './objecttree';
import { ObjectProperties } from './objectproperties';
import { AccordionPanel } from '@lumino/widgets';

export class LeftPanelWidget extends SidePanel {
  constructor(options: LeftPanelWidget.IOptions) {
    super();
    this.addClass('jpcad-sidepanel-widget');
    this.addClass('data-jcad-keybinding');
    this.node.tabIndex = 0;
    this._model = options.model;
    const header = new ControlPanelHeader();
    this.header.addWidget(header);

    const tree = new ObjectTree({ controlPanelModel: this._model });
    this.addWidget(tree);

    const properties = new ObjectProperties({
      controlPanelModel: this._model,
      formSchemaRegistry: options.formSchemaRegistry,
      tracker: options.tracker
    });
    this.addWidget(properties);

    this._handleFileChange = () => {
      header.title.label = this._currentModel?.filePath || '-';
    };

    options.tracker.currentChanged.connect((_, changed) => {
      if (changed) {
        if (this._currentModel) {
          this._currentModel.pathChanged.disconnect(this._handleFileChange);
        }

        this._currentModel = changed.model;
        header.title.label = changed.model.filePath;
        this._currentModel.pathChanged.connect(this._handleFileChange);
      } else {
        header.title.label = '-';
        this._currentModel = null;
      }
    });
    (this.content as AccordionPanel).setRelativeSizes([4, 6]);
  }

  dispose(): void {
    super.dispose();
  }

  private _currentModel: IJupyterCadModel | null;
  private _handleFileChange: () => void;
  private _model: IControlPanelModel;
}

export namespace LeftPanelWidget {
  export interface IOptions {
    model: IControlPanelModel;
    tracker: IJupyterCadTracker;
    formSchemaRegistry: IJCadFormSchemaRegistry;
  }

  export interface IProps {
    filePath?: string;
    sharedModel?: JupyterCadDoc;
  }
}
