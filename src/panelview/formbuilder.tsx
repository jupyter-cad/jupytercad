import * as React from 'react';
import { ISubmitEvent } from '@rjsf/core';
import { Widget } from '@lumino/widgets';
import { SchemaForm } from '@deathbeds/jupyterlab-rjsf';

import { IDict } from '../types';

interface IStates {
  internalData?: IDict;
  schema?: IDict;
}
interface IProps {
  sourceData: IDict | undefined;
  syncData: (properties: IDict) => void;
  schema?: IDict;
  cancel?: () => void;
}

export const LuminoSchemaForm = (props: React.PropsWithChildren<any>) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const { children } = props;
  React.useEffect(() => {
    const widget = children as SchemaForm;
    try {
      Widget.attach(widget, ref.current!);
    } catch(e) {
      console.warn('Exception while attaching Lumino widget.', e);
    }
    return () => {
      try {
        if (widget.isAttached || widget.node.isConnected) {
          Widget.detach(widget);
        }
      } catch(e) {
        console.warn('Exception while detaching Lumino widget.', e);
      }
    }
  }, [children]);
  return <div ref={ref}/>;
}


export class ObjectPropertiesForm extends React.Component<IProps, IStates> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      internalData: { ...this.props.sourceData },
      schema: props.schema
    };
  }

  setStateByKey = (key: string, value: any): void => {
    const floatValue = parseFloat(value);
    if (Number.isNaN(floatValue)) {
      return;
    }
    this.setState(
      old => ({
        ...old,
        internalData: { ...old.internalData, [key]: floatValue }
      }),
      () => this.props.syncData({ [key]: floatValue })
    );
  };

  componentDidUpdate(prevProps: IProps, prevState: IStates): void {
    if (prevProps.sourceData !== this.props.sourceData) {
      this.setState(old => ({ ...old, internalData: this.props.sourceData }));
    }
  }

  buildForm(): JSX.Element[] {
    if (!this.props.sourceData || !this.state.internalData) {
      return [];
    }
    const inputs: JSX.Element[] = [];

    for (const [key, value] of Object.entries(this.props.sourceData)) {
      let input: JSX.Element;
      if (typeof value === 'string' || typeof value === 'number') {
        input = (
          <div key={key}>
            <label htmlFor="">{key}</label>
            <input
              type="number"
              value={this.state.internalData[key]}
              onChange={e => this.setStateByKey(key, e.target.value)}
            />
          </div>
        );
        inputs.push(input);
      }
    }
    return inputs;
  }

  removeArrayButton(schema: IDict, uiSchema: IDict): void {
    Object.entries(schema['properties'] as IDict).forEach(([k, v]) => {
      if (v['type'] === 'array') {
        uiSchema[k] = {
          'ui:options': {
            orderable: false,
            removable: false,
            addable: false
          }
        };
      } else if (v['type'] === 'object') {
        uiSchema[k] = {};
        this.removeArrayButton(v, uiSchema[k]);
      }
    });
  }

  generateUiSchema(schema: IDict): IDict {
    const uiSchema = {
      additionalProperties: {
        'ui:label': false,
        classNames: 'jpcad-hidden-field'
      }
    };
    this.removeArrayButton(schema, uiSchema);
    return uiSchema;
  }

  onFormSubmit = (e: ISubmitEvent<any>): void => {
    const internalData = { ...this.state.internalData };
    Object.entries(e.formData).forEach(([k, v]) => (internalData[k] = v));
    this.setState(
      old => ({
        ...old,
        internalData
      }),
      () => {
        this.props.syncData(e.formData);
        this.props.cancel && this.props.cancel();
      }
    );
  };

  render(): React.ReactNode {
    if (this.props.schema) {
      const schema = { ...this.props.schema, additionalProperties: true };

      const submitRef = React.createRef<HTMLButtonElement>();

      const formSchema = new SchemaForm(
        schema || {},
        {
          liveValidate: true,
          formData: this.state.internalData,
          onSubmit: this.onFormSubmit,
          uiSchema: this.generateUiSchema(this.props.schema),
          children: (
            <button
              ref={submitRef}
              type="submit"
              style={{ display: 'none' }}
            />
          )
        },
      );

      return (
        <div className="jpcad-property-panel">
          <div className="jpcad-property-outer">
            <LuminoSchemaForm>
              {formSchema}
            </LuminoSchemaForm>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
            {this.props.cancel ? (
              <button
                style={{ width: '90px', height: '30px' }}
                className="btn btn-secondary"
                onClick={this.props.cancel}
              >
                Cancel
              </button>
            ) : null}

            <button
              style={{ width: '90px', height: '30px' }}
              className="btn btn-info"
              onClick={() => submitRef.current?.click()}
            >
              Submit
            </button>
          </div>
        </div>
      );
    } else {
      return <div>{this.buildForm()}</div>;
    }
  }
}
