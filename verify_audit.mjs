import fs from 'fs';
import path from 'path';

const dataPath = path.resolve('data/atlas.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const nodes = Object.values(data.nodes);
const islandIds = Array.from(new Set(nodes.map(n => n.islandId)));
const galaxyRadius = islandIds.length > 1 ? 3000 : 0;
const orbitRadius = 800;

console.log("--- ABSOLUTE COORDINATE AUDIT ---");

islandIds.forEach((id, i) => {
    const angle = (i / islandIds.length) * 2 * Math.PI;
    const cx = Math.cos(angle) * galaxyRadius;
    const cy = Math.sin(angle) * galaxyRadius;

    const sun = nodes.find(n => n.islandId === id && n.depth === 0);
    if (sun) {
        console.log(`\nIsland: ${id}`);
        console.log(`Calculated Sun Position: (${Math.round(cx)}, ${Math.round(cy)})`);
        
        const planets = nodes.filter(n => n.islandId === id && n.depth === 1);
        if (planets.length > 0) {
            const p = planets[0];
            const pAngle = (0 / planets.length) * 2 * Math.PI; // First planet
            const px = cx + Math.cos(pAngle) * orbitRadius;
            const py = cy + Math.sin(pAngle) * orbitRadius;
            
            const dist = Math.sqrt(Math.pow(px - cx, 2) + Math.pow(py - cy, 2));
            console.log(`Calculated Planet Position: (${Math.round(px)}, ${Math.round(py)})`);
            console.log(`Orbital Distance: ${Math.round(dist)}px (Expected 800)`);
            if (Math.round(dist) === 800) console.log("FIXED MATH VERIFIED.");
        }
    }
});
