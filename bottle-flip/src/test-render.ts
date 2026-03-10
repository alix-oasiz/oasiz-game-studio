// Ultra-simple test - just draw on canvas immediately
console.log("Script loaded!");

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

console.log("Canvas found:", canvas);

// Set canvas size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

console.log("Canvas size:", canvas.width, "x", canvas.height);

// Draw immediately
function draw() {
  console.log("Drawing...");

  // Dark blue background
  ctx.fillStyle = "#1a202c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Green ground
  const groundY = canvas.height - 100;
  ctx.fillStyle = "#48bb78";
  ctx.fillRect(0, groundY, canvas.width, 100);

  // Red bottle
  ctx.fillStyle = "#ff6b6b";
  ctx.fillRect(100, groundY - 120, 60, 120);

  // White text
  ctx.fillStyle = "white";
  ctx.font = "30px sans-serif";
  ctx.fillText("TEST RENDER v1.4", 10, 50);
}

console.log("Calling draw...");
draw();

console.log("Draw complete!");
