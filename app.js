const API_BASE = "https://api.tvmaze.com";
const MAX_RESULTS = 10;
const MAX_CAST_MEMBERS = 5;
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const showGrid = document.querySelector("#show-grid");
const statusMessage = document.querySelector("#status-message");
const resultCount = document.querySelector("#result-count");

let searchController;
let searchTimer;
let latestSearch = 0;

function setStatus(message, state = "default") {
  statusMessage.replaceChildren();
  statusMessage.className = "status-message";
  statusMessage.hidden = false;

  if (state === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    statusMessage.append(spinner, document.createTextNode(message));
  } else {
    const icon = document.createElement("span");
    icon.className = "status-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = state === "error" ? "!" : "✦";
    statusMessage.append(icon, document.createTextNode(message));

    if (state === "error") {
      statusMessage.classList.add("is-error");
    }
  }
}

function clearResults() {
  showGrid.replaceChildren();
  resultCount.textContent = "";
  showGrid.setAttribute("aria-busy", "false");
}

function textOrFallback(value, fallback = "Not available") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

function plainText(html) {
  if (!html) {
    return "";
  }
  const documentFragment = new DOMParser().parseFromString(String(html), "text/html");
  return (documentFragment.body.textContent || "").replace(/\s+/g, " ").trim();
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatUpdated(value) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }
  const date = new Date(Number(value) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function createDetail(label, value, className = "") {
  const wrapper = document.createElement("div");
  if (className) {
    wrapper.className = className;
  }
  const title = document.createElement("span");
  title.className = "detail-label";
  title.textContent = label;
  const content = document.createElement("span");
  content.className = "detail-value";
  content.textContent = value;
  wrapper.append(title, content);
  return wrapper;
}

function createShowCard(show) {
  const card = document.createElement("article");
  card.className = "show-card";

  const main = document.createElement("div");
  main.className = "card-main";
  const imageUrl = show.image?.medium || show.image?.original;

  if (imageUrl) {
    const poster = document.createElement("img");
    poster.className = "poster";
    poster.src = imageUrl;
    poster.alt = `Poster for ${textOrFallback(show.name, "this show")}`;
    poster.loading = "lazy";
    poster.addEventListener("error", () => {
      const placeholder = document.createElement("div");
      placeholder.className = "poster-placeholder";
      placeholder.setAttribute("role", "img");
      placeholder.setAttribute("aria-label", `No poster available for ${textOrFallback(show.name, "this show")}`);
      placeholder.textContent = "✦";
      poster.replaceWith(placeholder);
    }, { once: true });
    main.append(poster);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "poster-placeholder";
    placeholder.setAttribute("role", "img");
    placeholder.setAttribute("aria-label", `No poster available for ${textOrFallback(show.name, "this show")}`);
    placeholder.textContent = "✦";
    main.append(placeholder);
  }

  const copy = document.createElement("div");
  copy.className = "card-copy";
  const title = document.createElement("h3");
  title.className = "show-title";
  title.textContent = textOrFallback(show.name);
  copy.append(title);

  const meta = document.createElement("div");
  meta.className = "show-meta";
  const premiered = document.createElement("span");
  premiered.textContent = `Premiered ${formatDate(show.premiered)}`;
  meta.append(premiered);
  if (show.rating?.average !== null && show.rating?.average !== undefined) {
    const rating = document.createElement("span");
    rating.className = "rating";
    rating.textContent = `★ ${show.rating.average} / 10`;
    meta.append(rating);
  }
  copy.append(meta);

  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent = plainText(show.summary) || "No summary available.";
  copy.append(summary);

  const genres = document.createElement("div");
  genres.className = "genres";
  if (Array.isArray(show.genres) && show.genres.length > 0) {
    for (const genre of show.genres) {
      const tag = document.createElement("span");
      tag.className = "genre-tag";
      tag.textContent = genre;
      genres.append(tag);
    }
  } else {
    const tag = document.createElement("span");
    tag.className = "genre-tag";
    tag.textContent = "Genre not available";
    genres.append(tag);
  }
  copy.append(genres);
  main.append(copy);
  card.append(main);

  const details = document.createElement("div");
  details.className = "card-details";
  details.append(
    createDetail("Last updated", formatUpdated(show.updated)),
    createDetail("Network", textOrFallback(show.network?.name || show.webChannel?.name)),
  );

  const castRow = createDetail("Main cast", "Loading cast…", "cast-row");
  castRow.querySelector(".detail-value").classList.add("cast-value", "is-loading");
  details.append(castRow);
  card.append(details);

  const footer = document.createElement("div");
  footer.className = "card-footer";
  const link = document.createElement("a");
  link.className = "tvmaze-link";
  link.href = show.url || `https://www.tvmaze.com/shows/${encodeURIComponent(show.id)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View on TVmaze ↗";
  footer.append(link);
  card.append(footer);

  loadCast(show.id, castRow.querySelector(".detail-value"));
  return card;
}

async function loadCast(showId, castElement) {
  try {
    const response = await fetch(`${API_BASE}/shows/${encodeURIComponent(showId)}/cast`);
    if (!response.ok) {
      throw new Error(`Cast request failed with status ${response.status}`);
    }
    const cast = await response.json();
    const names = cast
      .slice(0, MAX_CAST_MEMBERS)
      .map((entry) => entry.person?.name)
      .filter(Boolean);
    castElement.textContent = names.length > 0 ? names.join(", ") : "Not available";
    castElement.classList.remove("is-loading");
  } catch (error) {
    console.error("Unable to load show cast:", error);
    castElement.textContent = "Cast unavailable";
    castElement.classList.remove("is-loading");
  }
}

async function searchShows(query) {
  const searchId = ++latestSearch;
  if (searchController) {
    searchController.abort();
  }
  searchController = new AbortController();
  clearResults();

  if (!query.trim()) {
    setStatus("Search for a show to get started.");
    return;
  }

  showGrid.setAttribute("aria-busy", "true");
  setStatus(`Looking for “${query.trim()}”…`, "loading");

  try {
    const response = await fetch(
      `${API_BASE}/search/shows?q=${encodeURIComponent(query.trim())}`,
      { signal: searchController.signal },
    );
    if (!response.ok) {
      throw new Error(`Search request failed with status ${response.status}`);
    }
    const results = await response.json();
    if (searchId !== latestSearch) {
      return;
    }

    const shows = results
      .map((result) => result.show)
      .filter(Boolean)
      .slice(0, MAX_RESULTS);

    if (shows.length === 0) {
      setStatus(`No shows found for “${query.trim()}”. Try another title or keyword.`);
      return;
    }

    statusMessage.hidden = true;
    resultCount.textContent = `${shows.length} ${shows.length === 1 ? "show" : "shows"} found`;
    const fragment = document.createDocumentFragment();
    for (const show of shows) {
      fragment.append(createShowCard(show));
    }
    showGrid.append(fragment);
  } catch (error) {
    if (error.name === "AbortError" || searchId !== latestSearch) {
      return;
    }
    console.error("Unable to search TVmaze:", error);
    setStatus("We couldn’t load shows right now. Please check your connection and try again.", "error");
  } finally {
    if (searchId === latestSearch) {
      showGrid.setAttribute("aria-busy", "false");
    }
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  searchShows(searchInput.value);
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = searchInput.value;
  if (!query.trim()) {
    searchShows("");
    return;
  }
  searchTimer = setTimeout(() => searchShows(query), 350);
});
