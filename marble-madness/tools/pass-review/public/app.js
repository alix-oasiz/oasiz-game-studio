const MAX_VISIBLE = 2;

const elements = {
  meta: document.getElementById("refresh-meta"),
  grid: document.getElementById("grid"),
  emptyState: document.getElementById("empty-state"),
};

let lastSignature = "";

function imageSource(filePath, modifiedMs) {
  return "/api/image?path=" + encodeURIComponent(filePath) + "&v=" + encodeURIComponent(String(modifiedMs));
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleTimeString();
}

function render(images, updatedAt) {
  const latest = images.slice(0, MAX_VISIBLE);
  const signature = latest.map((img) => img.path + ":" + String(img.modifiedMs)).join("|");
  if (signature === lastSignature) {
    elements.meta.textContent = "Auto-refreshing every 2s | Last check " + formatTime(updatedAt);
    return;
  }
  lastSignature = signature;

  elements.grid.innerHTML = "";
  elements.emptyState.classList.toggle("hidden", latest.length > 0);

  for (const image of latest) {
    const card = document.createElement("article");
    card.className = "card";

    const preview = document.createElement("img");
    preview.className = "card-image";
    preview.src = imageSource(image.path, image.modifiedMs);
    preview.alt = image.name;
    preview.loading = "lazy";

    const caption = document.createElement("div");
    caption.className = "card-caption";
    caption.textContent = image.name + " | " + formatTime(image.modifiedAt);

    card.appendChild(preview);
    card.appendChild(caption);
    elements.grid.appendChild(card);
  }

  elements.meta.textContent =
    "Showing latest " +
    String(latest.length) +
    " screenshots | Last refresh " +
    formatTime(updatedAt);
}

async function refresh() {
  try {
    const response = await fetch("/api/gallery", { cache: "no-store" });
    const data = await response.json();
    const images = Array.isArray(data.images) ? data.images : [];
    render(images, data.updatedAt ?? new Date().toISOString());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh";
    elements.meta.textContent = "Error: " + message;
  }
}

refresh();
setInterval(refresh, 2000);
