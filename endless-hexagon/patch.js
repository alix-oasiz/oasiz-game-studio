const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// 1. Make GAME OVER letters red
content = content.replace(
    /\.go-header h1 \{[\s\S]*?color: #ffffff;/m,
    match => match.replace('color: #ffffff;', 'color: #EF5350;')
);

// 2. Add black shadows (border-bottom-color and border-right-color) to elements with border-bottom-width
const elementsToUpdate = [
    '#play-btn {',
    '#settings-btn {',
    '.modal-card {',
    '.modal-btn {',
    '.settings-row {',
    '.pixel-toggle {',
    '#close-settings {'
];

for (const el of elementsToUpdate) {
    const regex = new RegExp(`(${el.replace(/[.*+?^$\/{}()|[\\]\\\\]/g, '\\$&')}[\\s\\S]*?border:[^;]+;)(?!\\s*border-bottom-color)`, 'm');
    content = content.replace(regex, `$1\n            border-bottom-color: #000000; border-right-color: #000000;`);
}

// Also update hover states to keep the black shadow if they change border-color
const hoverElements = [
    '#play-btn:not(.loading):hover {',
    '#settings-btn:hover {',
    '#restart-btn:hover {',
    '#go-settings-btn:hover {',
    '#close-settings:hover {'
];

for (const el of hoverElements) {
    const regex = new RegExp(`(${el.replace(/[.*+?^$\/{}()|[\\]\\\\]/g, '\\$&')}[\\s\\S]*?border-color: #[a-fA-F0-9]+;)(?!\\s*border-bottom-color)`, 'm');
    content = content.replace(regex, `$1 border-bottom-color: #000000; border-right-color: #000000;`);
}

fs.writeFileSync('index.html', content);
