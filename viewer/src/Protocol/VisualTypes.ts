import { IAtlasNode, IAtlasEdge, GuardState } from '../../../src/Shared/Protocol';
import * as d3 from 'd3';

export interface VisualNode extends IAtlasNode, d3.SimulationNodeDatum {
    radius: number;
    guardState?: GuardState;
    authorityId?: string;
}

export interface VisualLink extends d3.SimulationLinkDatum<VisualNode> {
    isGravity: boolean;
}
