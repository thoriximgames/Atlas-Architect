import { IAtlasNode, IAtlasEdge } from '../../../src/Shared/Protocol';
import * as d3 from 'd3';

export interface VisualNode extends IAtlasNode, d3.SimulationNodeDatum {
    radius: number;
}

export interface VisualLink extends d3.SimulationLinkDatum<VisualNode> {
    isGravity: boolean;
}
