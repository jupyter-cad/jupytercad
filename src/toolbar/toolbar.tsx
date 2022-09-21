import * as React from 'react';
import { ToolbarModel } from './model';
import { OperatorToolbarReact } from './operatortoolbar';
import { PartToolbarReact } from './parttoolbar';

interface IProps {
  toolbarModel: ToolbarModel;
}

interface IState {
  selected: 'PART' | 'OPERATOR';
}
export class ToolbarReact extends React.Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = { selected: 'PART' };
  }
  async componentDidMount(): Promise<void> {
    await this.props.toolbarModel.ready();
  }

  render(): React.ReactNode {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center'
        }}
      >
        <div className="jp-HTMLSelect jp-DefaultStyle jp-Notebook-toolbarCellTypeDropdown">
          <select
            onChange={e =>
              this.setState(old => ({
                ...old,
                selected: e.target.value as any
              }))
            }
          >
            {this._toolbarOption.map(value => (
              <option value={value}>{value}</option>
            ))}
          </select>
          <span>
            <svg
              style={{
                height: 'auto',
                position: 'absolute',
                left: '90px',
                top: '5px',
                width: '16px'
              }}
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              viewBox="0 0 18 18"
              data-icon="ui-components:caret-down-empty"
            >
              <g
                xmlns="http://www.w3.org/2000/svg"
                className="jp-icon3"
                fill="#616161"
                shape-rendering="geometricPrecision"
              >
                <path d="M5.2,5.9L9,9.7l3.8-3.8l1.2,1.2l-4.9,5l-4.9-5L5.2,5.9z"></path>
              </g>
            </svg>
          </span>
        </div>
        {this.state.selected === 'PART' && (
          <PartToolbarReact toolbarModel={this.props.toolbarModel} />
        )}
        {this.state.selected === 'OPERATOR' && (
          <OperatorToolbarReact toolbarModel={this.props.toolbarModel} />
        )}
        {/* <OperatorToolbarReact toolbarModel={this.props.toolbarModel} /> */}
      </div>
    );
  }

  private _toolbarOption = ['PART', 'OPERATOR'];
}
