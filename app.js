const CLIENT_ID = "6574f3a475c2434b912779d5d0425890";

const REDIRECT_URI =
  "https://anianoufel-droid.github.io/Hister--dition-Magalie/";

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state"
].join(" ");

// Sur cellulaire : pas de lecteur Spotify dans la page.
// On envoie seulement la commande « joue cette chanson » à un appareil Spotify.
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let accessToken = null;
let spotifyPlayer = null;
let spotifyDeviceId = null;
let appStarted = false;


// ===============================
// OUTILS
// ===============================

function $(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const el = $("statusText");
  if (el) el.textContent = text;
}


// ===============================
// PKCE
// ===============================

function generateRandomString(length) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


// ===============================
// TOKENS (avec renouvellement automatique)
// ===============================

function saveTokens(data) {
  accessToken = data.access_token;
  localStorage.setItem("spotify_access_token", data.access_token);
  localStorage.setItem(
    "spotify_expires_at",
    String(Date.now() + data.expires_in * 1000)
  );
  if (data.refresh_token) {
    localStorage.setItem("spotify_refresh_token", data.refresh_token);
  }
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotify_refresh_token");
  if (!refreshToken) return false;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const data = await response.json();
  if (!data.access_token) return false;

  saveTokens(data);
  return true;
}

// Renvoie un token valide (le renouvelle s'il expire dans moins d'une minute)
async function getValidToken() {
  const expiresAt = Number(localStorage.getItem("spotify_expires_at") || 0);

  if (!accessToken || Date.now() > expiresAt - 60000) {
    const ok = await refreshAccessToken();
    if (!ok) return null;
  }
  return accessToken;
}


// ===============================
// LOGIN
// ===============================

async function loginSpotify() {
  const verifier = generateRandomString(128);
  localStorage.setItem("spotify_code_verifier", verifier);

  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  window.location.href =
    "https://accounts.spotify.com/authorize?" + params.toString();
}


// ===============================
// CALLBACK SPOTIFY / DÉMARRAGE
// ===============================

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);

  // Si on arrive avec ?card=N, on s'en souvient : ce paramètre
  // serait perdu pendant la connexion à Spotify.
  const cardInUrl = params.get("card");
  if (cardInUrl) {
    localStorage.setItem("pending_card", cardInUrl);
  }

  const code = params.get("code");

  // Retour de Spotify avec un code → on l'échange contre un token
  if (code) {
    const verifier = localStorage.getItem("spotify_code_verifier");

    if (!verifier) {
      alert("Erreur : code PKCE introuvable. Réessaie de te connecter.");
      return;
    }

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier
      })
    });

    const data = await response.json();

    if (!data.access_token) {
      console.error("Réponse Spotify :", data);
      alert("Spotify n'a pas donné de token.");
      return;
    }

    saveTokens(data);
    window.history.replaceState({}, document.title, window.location.pathname);
    startApplication();
    return;
  }

  // Pas de code : a-t-on déjà une session sauvegardée ?
  // (c'est ce cas qui manquait : un scan de QR rouvre la page sans code)
  accessToken = localStorage.getItem("spotify_access_token");
  const hasSession =
    accessToken || localStorage.getItem("spotify_refresh_token");

  if (hasSession && (await getValidToken())) {
    startApplication();
  }
  // Sinon : le bouton « Se connecter » reste affiché
}


// ===============================
// APPLICATION
// ===============================

function startApplication() {
  appStarted = true;

  const loginButton = $("loginButton");
  const loginSection = $("loginSection");
  const app = $("app");

  if (loginButton) loginButton.classList.add("hidden");
  if (loginSection) loginSection.classList.add("hidden");
  if (app) app.classList.remove("hidden");

  if (IS_MOBILE) {
    setStatus("Prêt 📱 (le cellulaire est la télécommande)");
    checkCardFromURL();
  } else {
    setStatus("Connexion à Spotify...");
    startSpotifyPlayer();
  }
}


// ===============================
// SPOTIFY PLAYER (ordinateur seulement)
// ===============================

window.onSpotifyWebPlaybackSDKReady = function () {
  if (appStarted && !IS_MOBILE) {
    startSpotifyPlayer();
  }
};

function startSpotifyPlayer() {
  if (!window.Spotify) return; // le SDK n'est pas encore chargé
  if (spotifyPlayer) return;

  spotifyPlayer = new Spotify.Player({
    name: "NoelHits",
    getOAuthToken: async callback => {
      callback(await getValidToken());
    },
    volume: 0.8
  });

  spotifyPlayer.addListener("ready", ({ device_id }) => {
    console.log("Spotify est prêt !", device_id);
    spotifyDeviceId = device_id;
    setStatus("Spotify est prêt 🎵");
    checkCardFromURL();
  });

  spotifyPlayer.addListener("not_ready", () => {
    setStatus("Spotify s'est déconnecté…");
  });

  ["initialization_error", "authentication_error", "account_error", "playback_error"]
    .forEach(type => {
      spotifyPlayer.addListener(type, ({ message }) => {
        console.error(type, message);
        if (type === "account_error") {
          setStatus("Spotify Premium est requis ⚠️");
        }
      });
    });

  spotifyPlayer.connect();
}


// ===============================
// CHOIX DE L'APPAREIL
// ===============================

async function findDeviceId(token) {
  // Sur l'ordinateur, on utilise directement notre lecteur NoelHits
  if (spotifyDeviceId) return spotifyDeviceId;

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/devices",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) return null;

  const { devices } = await response.json();
  if (!devices || devices.length === 0) return null;

  const noelHits = devices.filter(d => d.name === "NoelHits");

  const choice =
    noelHits.find(d => d.is_active) ||
    noelHits[0] ||
    devices.find(d => d.is_active) ||
    devices[0];

  return choice.id;
}


// ===============================
// JOUER UNE CARTE
// ===============================

async function playCard(cardNumber) {
  console.log("Carte demandée :", cardNumber);

  const token = await getValidToken();
  if (!token) {
    setStatus("Session expirée : reconnecte-toi à Spotify");
    $("loginSection")?.classList.remove("hidden");
    $("loginButton")?.classList.remove("hidden");
    return;
  }

  const response = await fetch("cards.json");
  const cards = await response.json();

  const card = cards.find(c => Number(c.id) === Number(cardNumber));
  if (!card) {
    setStatus(`Carte ${cardNumber} introuvable`);
    return;
  }

  const spotifyURI = `spotify:track:${card.spotifyId}`;
  const webLink = `https://open.spotify.com/track/${card.spotifyId}`;

  const deviceId = await findDeviceId(token);

  // Aucun appareil Spotify actif → sur cellulaire, on ouvre l'app Spotify
  if (!deviceId) {
    if (IS_MOBILE) {
      window.location.href = webLink;
    } else {
      setStatus("Aucun appareil Spotify trouvé");
    }
    return;
  }

  const playResponse = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uris: [spotifyURI], position_ms: 0 })
    }
  );

  if (!playResponse.ok) {
    console.error("Erreur Spotify :", await playResponse.text());
    if (IS_MOBILE) {
      window.location.href = webLink; // plan B
    } else {
      setStatus("Erreur de lecture Spotify");
    }
    return;
  }

  setStatus(`🎵 Carte ${cardNumber} en lecture`);
  console.log("🎵 CHANSON LANCÉE !");
}


// ===============================
// ?card=1
// ===============================

function checkCardFromURL() {
  const params = new URLSearchParams(window.location.search);
  const card = params.get("card") || localStorage.getItem("pending_card");

  if (card) {
    localStorage.removeItem("pending_card");
    playCard(card);
  }
}


// ===============================
// LECTURE / PAUSE
// ===============================

async function togglePlayPause() {
  // Ordinateur : on pilote le lecteur NoelHits directement
  if (spotifyPlayer) {
    spotifyPlayer.activateElement(); // nécessaire pour l'audio dans le navigateur
    spotifyPlayer.togglePlay();
    return;
  }

  // Cellulaire : on pilote via l'API
  const token = await getValidToken();
  if (!token) return;

  const state = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` }
  });

  let isPlaying = false;
  if (state.status === 200) {
    isPlaying = (await state.json()).is_playing;
  }

  await fetch(
    `https://api.spotify.com/v1/me/player/${isPlaying ? "pause" : "play"}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` } }
  );
}


// ===============================
// DÉMARRAGE
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  $("loginButton")?.addEventListener("click", loginSpotify);

  $("playButton")?.addEventListener("click", togglePlayPause);

  $("testButton")?.addEventListener("click", () => {
    spotifyPlayer?.activateElement();
    const number = prompt("Numéro de carte :");
    if (number) playCard(number);
  });

  handleCallback();
});
