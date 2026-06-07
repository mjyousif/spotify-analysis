declare module 'react-plotly.js' {
  import { Component } from 'react';
  import { PlotParams } from 'plotly.js';

  class PlotlyChart extends Component<PlotParams> {}
  export default PlotlyChart;
}
