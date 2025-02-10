import { IAnnotationModel } from '@jupytercad/schema';
import { PanelWithToolbar, ReactWidget } from '@jupyterlab/ui-components';
import * as React from 'react';

import { Annotation } from '../annotation/view';

interface IProps {
  model: IAnnotationModel;
}

export class ReactAnnotations extends React.Component<IProps> {
  constructor(props: IProps) {
    super(props);

    const updateCallback = () => {
      this.forceUpdate();
    };

    this._model = props.model;

    this._model.modelChanged.connect(async () => {
      // await this._model?.model?.ready;

      this._model?.model?.sharedMetadataChanged.disconnect(updateCallback);
      this._model = props.model;
      this._model?.model?.sharedMetadataChanged.connect(updateCallback);
      this.forceUpdate();
    });
  }

  render(): JSX.Element {
    const annotationIds = this._model?.getAnnotationIds();

    if (!annotationIds || !this._model) {
      return <div></div>;
    }

    const annotations = annotationIds.map((id: string) => {
      return (
        <div>
          <Annotation model={this._model} itemId={id} />
          <hr className="jpcad-Annotations-Separator"></hr>
        </div>
      );
    });

    return <div>{annotations}</div>;
  }

  private _model: IAnnotationModel;
}

export class Annotations extends PanelWithToolbar {
  constructor(options: Annotations.IOptions) {
    super({});

    this.title.label = 'Annotations';
    this.addClass('jpcad-Annotations');

    this._model = options.model;

    this._widget = ReactWidget.create(<ReactAnnotations model={this._model} />);

    this.addWidget(this._widget);
  }

  private _widget: ReactWidget;
  private _model: IAnnotationModel;
}

export namespace Annotations {
  export interface IOptions {
    model: IAnnotationModel;
  }
}
