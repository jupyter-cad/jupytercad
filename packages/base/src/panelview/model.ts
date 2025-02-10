import { IJupyterCadDoc, IJupyterCadModel } from '@jupytercad/schema';
import { ISignal } from '@lumino/signaling';

import {
  IJupyterCadTracker,
  IJupyterCadOutputwidget
} from '@jupytercad/schema';
import { IControlPanelModel } from '../types';
import { JupyterCadOutputwidget } from '../widget';
import { MainViewModel } from '../3dview/mainviewmodel';

export class ControlPanelModel implements IControlPanelModel {
  constructor(options: ControlPanelModel.IOptions) {
    this._tracker = options.tracker;
    this._documentChanged = this._tracker.currentChanged;
  }

  get documentChanged(): ISignal<
    IJupyterCadTracker,
    IJupyterCadOutputwidget | null
  > {
    return this._documentChanged;
  }

  get filePath(): string | undefined {
    return this._tracker.currentWidget?.model.filePath;
  }

  get jcadModel(): IJupyterCadModel | undefined {
    return this._tracker.currentWidget?.model;
  }

  get sharedModel(): IJupyterCadDoc | undefined {
    return this._tracker.currentWidget?.model.sharedModel;
  }

  get mainViewModel(): MainViewModel | undefined {
    return (this._tracker.currentWidget as JupyterCadOutputwidget | null)
      ?.content.currentViewModel;
  }

  disconnect(f: any): void {
    this._tracker.forEach(w => {
      w.model.sharedObjectsChanged.disconnect(f);
      w.model.sharedOptionsChanged.disconnect(f);
      w.model.sharedMetadataChanged.disconnect(f);
    });
    this._tracker.forEach(w => w.model.themeChanged.disconnect(f));
    this._tracker.forEach(w => w.model.clientStateChanged.disconnect(f));
  }

  private readonly _tracker: IJupyterCadTracker;
  private _documentChanged: ISignal<
    IJupyterCadTracker,
    IJupyterCadOutputwidget | null
  >;
}

namespace ControlPanelModel {
  export interface IOptions {
    tracker: IJupyterCadTracker;
  }
}
