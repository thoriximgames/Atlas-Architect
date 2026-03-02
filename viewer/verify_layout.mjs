import fs from 'fs';
import * as d3 from 'd3';
import path from 'path';

const dataPath = path.resolve('../data/atlas.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const nodes = Object.values(data.nodes).map(n => ({
    ...n,
    radius: n.depth === 0 ? 55 : 15,
    depth: n.depth || 0,
    islandId: n.islandId || 'orphanage'
}));

const links = data.edges.map(e => ({
    source: e.source,
    target: e.target
}));

const islandIds = Array.from(new Set(nodes.map(n => n.islandId))).filter(id => id !== 'orphanage');
const islandCenters = new Map();
const cols = Math.ceil(Math.sqrt(islandIds.length));
const islandGap = 3000; 

islandIds.forEach((id, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    islandCenters.set(id, { x: col * islandGap, y: row * islandGap });
});
islandCenters.set('orphanage', { x: 10000, y: 10000 });

nodes.forEach(n => {
    const center = islandCenters.get(n.islandId) || {x:0, y:0};
    n.x = center.x + Math.random();
    n.y = center.y + Math.random();
});

console.log("--- STARTING SIMULATION ---");
console.log(`Total Nodes: ${nodes.length}`);

const simulation = d3.forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-5000))
    .force('collision', d3.forceCollide().radius(d => d.radius + 200))
    .force('x', d3.forceX(d => islandCenters.get(d.islandId)?.x || 0).strength(0.8))
    .force('y', d3.forceY(d => islandCenters.get(d.islandId)?.y || 0).strength(0.8))
    .force('radial', d3.forceRadial(d => d.depth * 600 + 100, d => islandCenters.get(d.islandId)?.x || 0, d => islandCenters.get(d.islandId)?.y || 0).strength(1.5))
    .stop();

for (let i = 0; i < 300; ++i) simulation.tick();

console.log("\n--- VERIFYING 'SOLAR SYSTEM' ARCHITECTURE ---");

const island0Nodes = nodes.filter(n => n.islandId === 'island_0');
const master = island0Nodes.find(n => n.depth === 0);
const children = island0Nodes.filter(n => n.depth === 1);

if (!master) {
    console.error("FATAL: No Master Node found for Island 0!");
} else {
    const center = islandCenters.get('island_0');
    const distFromCenter = Math.sqrt(Math.pow(master.x - center.x, 2) + Math.pow(master.y - center.y, 2));
    
    console.log(`\nISLAND 0 MASTER: ${master.id}`);
    console.log(`Position: (${Math.round(master.x)}, ${Math.round(master.y)})`);
    console.log(`Island Center: (${center.x}, ${center.y})`);
    console.log(`Distance from Center: ${Math.round(distFromCenter)}px (Expected < 150px)`);
    
    if (distFromCenter > 200) console.error("FAIL: Master is drifting too far!");
    else console.log("PASS: Master is anchored.");

    if (children.length > 0) {
        console.log(`\nISLAND 0 CHILDREN (${children.length} nodes):`);
        const avgDist = children.reduce((acc, c) => acc + Math.sqrt(Math.pow(c.x - center.x, 2) + Math.pow(c.y - center.y, 2)), 0) / children.length;
        console.log(`Avg Distance from Center: ${Math.round(avgDist)}px (Expected ~700px)`);
        
        if (avgDist < 500 || avgDist > 900) console.error("FAIL: Children are not in the correct orbit!");
        else console.log("PASS: Children are orbiting correctly.");
    }
}

const orphan = nodes.find(n => n.islandId === 'orphanage');
if (orphan) {
    console.log(`Orphan Position: (${Math.round(orphan.x)}, ${Math.round(orphan.y)}) (Expected ~10000, 10000)`);
    if (orphan.x < 9000) console.error("FAIL: Orphans are leaking into the map!");
    else console.log("PASS: Orphans are exiled.");
}
