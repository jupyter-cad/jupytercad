import {
  IAnnotationModel,
  IJupyterCadModel,
  IJupyterCadTracker,
  JupyterCadDoc
} from '@jupytercad/schema';
import { SidePanel } from '@jupyterlab/ui-components';

import { IControlPanelModel } from '../types';
import { Annotations } from './annotations';
import { ControlPanelHeader } from './header';
import { SuggestionPanel } from '../suggestion/suggestionpanel';
import { SuggestionModel } from '../suggestion/model';
import { IForkManager } from '@jupyter/docprovider';
import { ICollaborativeDrive } from '@jupyter/collaborative-drive';

export class RightPanelWidget extends SidePanel {
  constructor(options: RightPanelWidget.IOptions) {
    super();
    this.addClass('jpcad-sidepanel-widget');
    this.addClass('data-jcad-keybinding');
    this.node.tabIndex = 0;
    const { model, tracker, forkManager, collaborativeDrive, annotationModel } =
      options;
    this._model = model;
    this._annotationModel = annotationModel;

    const header = new ControlPanelHeader();
    this.header.addWidget(header);

    const annotations = new Annotations({ model: this._annotationModel });
    this.addWidget(annotations);
    let suggestionModel: SuggestionModel | undefined = undefined;
    if (forkManager) {
      suggestionModel = new SuggestionModel({
        jupytercadModel: this._model?.jcadModel,
        filePath: '',
        tracker: tracker,
        forkManager: forkManager,
        collaborativeDrive: collaborativeDrive
      });
      const suggestion = new SuggestionPanel({ model: suggestionModel });
      this.addWidget(suggestion);
    }

    this._handleFileChange = () => {
      header.title.label = this._currentModel?.filePath || '-';
    };

    options.tracker.currentChanged.connect(async (_, changed) => {
      if (changed) {
        if (this._currentModel) {
          this._currentModel.pathChanged.disconnect(this._handleFileChange);
        }
        this._currentModel = changed.model;
        header.title.label = this._currentModel.filePath;
        this._currentModel.pathChanged.connect(this._handleFileChange);
        this._annotationModel.model =
          options.tracker.currentWidget?.model || undefined;
        // await changed.model.ready;

        suggestionModel?.switchContext({
          filePath: changed.model.filePath,
          jupytercadModel: changed.model
        });
      } else {
        header.title.label = '-';
        this._currentModel = null;
        this._annotationModel.model = undefined;
        suggestionModel?.switchContext({
          filePath: '',
          jupytercadModel: undefined
        });
      }
    });
  }

  dispose(): void {
    super.dispose();
  }

  private _currentModel: IJupyterCadModel | null;
  private _handleFileChange: () => void;
  private _model: IControlPanelModel;
  private _annotationModel: IAnnotationModel;
}

export namespace RightPanelWidget {
  export interface IOptions {
    model: IControlPanelModel;
    tracker: IJupyterCadTracker;
    annotationModel: IAnnotationModel;
    forkManager?: IForkManager;
    collaborativeDrive?: ICollaborativeDrive;
  }
  export interface IProps {
    filePath?: string;
    sharedModel?: JupyterCadDoc;
  }
}
