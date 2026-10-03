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

let accessToken = null;
let spotifyPlayer = null;
let spotifyDeviceId = null;


// ===============================
// PKCE
// ===============================

function generateRandomString(length) {

  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  return result;
}


async function generateCodeChallenge(verifier) {

  const data =
    new TextEncoder().encode(verifier);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return btoa(
    String.fromCharCode(
      ...new Uint8Array(digest)
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


// ===============================
// LOGIN
// ===============================

async function loginSpotify() {

  console.log("Spotify : bouton cliqué");

  const verifier =
    generateRandomString(128);

  localStorage.setItem(
    "spotify_code_verifier",
    verifier
  );

  const challenge =
    await generateCodeChallenge(verifier);

  const params =
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: "S256",
      code_challenge: challenge
    });

  window.location.href =
    "https://accounts.spotify.com/authorize?" +
    params.toString();
}


// ===============================
// CALLBACK SPOTIFY
// ===============================

async function handleCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const code =
    params.get("code");

  if (!code) {
    return;
  }

  const verifier =
    localStorage.getItem(
      "spotify_code_verifier"
    );

  if (!verifier) {

    alert(
      "Erreur : code PKCE introuvable."
    );

    return;
  }

  const response =
    await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier
        })
      }
    );

  const data =
    await response.json();

  console.log("Réponse Spotify :", data);

  if (!data.access_token) {

    alert(
      "Spotify n'a pas donné de token."
    );

    return;
  }

  accessToken =
    data.access_token;

  localStorage.setItem(
    "spotify_access_token",
    accessToken
  );

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );

  startApplication();
}


// ===============================
// APPLICATION
// ===============================

function startApplication() {

  const loginButton =
    document.getElementById(
      "loginButton"
    );

  const app =
    document.getElementById(
      "app"
    );

  const statusText =
    document.getElementById(
      "statusText"
    );

  if (loginButton) {
    loginButton.classList.add("hidden");
  }

  if (app) {
    app.classList.remove("hidden");
  }

  if (statusText) {
    statusText.textContent =
      "Connexion à Spotify...";
  }

  startSpotifyPlayer();
}


// ===============================
// SPOTIFY PLAYER
// ===============================

window.onSpotifyWebPlaybackSDKReady =
  function () {

    console.log(
      "Spotify Web Playback SDK chargé"
    );

    if (!accessToken) {
      return;
    }

    startSpotifyPlayer();
  };


function startSpotifyPlayer() {

  if (!window.Spotify) {

    console.log(
      "SDK Spotify pas encore disponible."
    );

    return;
  }

  if (spotifyPlayer) {
    return;
  }

  spotifyPlayer =
    new Spotify.Player({

      name: "NoelHits",

      getOAuthToken: callback => {
        callback(accessToken);
      },

      volume: 0.8
    });


  spotifyPlayer.addListener(
    "ready",
    ({ device_id }) => {

      console.log(
        "Spotify est prêt !",
        device_id
      );

      spotifyDeviceId =
        device_id;

      const statusText =
        document.getElementById(
          "statusText"
        );

      if (statusText) {

        statusText.textContent =
          "Spotify est prêt 🎵";
      }

      checkCardFromURL();
    }
  );


  spotifyPlayer.addListener(
    "initialization_error",
    ({ message }) => {

      console.error(
        "Erreur Spotify :",
        message
      );
    }
  );


  spotifyPlayer.addListener(
    "authentication_error",
    ({ message }) => {

      console.error(
        "Erreur authentification :",
        message
      );
    }
  );


  spotifyPlayer.addListener(
    "account_error",
    ({ message }) => {

      console.error(
        "Erreur compte :",
        message
      );
    }
  );


  spotifyPlayer.addListener(
    "playback_error",
    ({ message }) => {

      console.error(
        "Erreur lecture :",
        message
      );
    }
  );


  spotifyPlayer.connect();
}


// ===============================
// JOUER UNE CARTE
// ===============================

async function playCard(cardNumber) {

  console.log(
    "Carte demandée :",
    cardNumber
  );

  if (!spotifyDeviceId) {

    console.error(
      "Spotify n'est pas encore prêt."
    );

    return;
  }

  const response =
    await fetch("cards.json");

  const cards =
    await response.json();

  const card =
    cards.find(
      card =>
        Number(card.id) ===
        Number(cardNumber)
    );

  if (!card) {

    console.error(
      "Carte introuvable."
    );

    return;
  }

  const spotifyURI =
    `spotify:track:${card.spotifyId}`;

  console.log(
    "Lecture :",
    spotifyURI
  );


  // Transférer Spotify vers NoelHits

  await fetch(
    "https://api.spotify.com/v1/me/player",
    {
      method: "PUT",

      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        device_ids: [
          spotifyDeviceId
        ],
        play: false
      })
    }
  );


  // Lancer la chanson

  const playResponse =
    await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`,
      {
        method: "PUT",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          uris: [
            spotifyURI
          ],
          position_ms: 0
        })
      }
    );


  if (!playResponse.ok) {

    console.error(
      "Erreur Spotify :",
      await playResponse.text()
    );

    return;
  }

  console.log(
    "🎵 CHANSON LANCÉE !"
  );
}


// ===============================
// ?card=1
// ===============================

function checkCardFromURL() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const card =
    params.get("card");

  if (card) {

    console.log(
      "Carte trouvée dans URL :",
      card
    );

    playCard(card);
  }
}


// ===============================
// BOUTON TEST
// ===============================
 
document.addEventListener(
"DOMContentLoaded",
() => {
 
const loginButton =
document.getElementById(
"loginButton"
);
 
if (loginButton) {
loginButton.addEventListener(
"click",
loginSpotify
);
}
 
const testButton =
document.getElementById(
"testButton"
);
 
if (testButton) {
 
testButton.addEventListener(
"click",
() => {
 
const number =
prompt(
"Numéro de carte :"
);
 
if (number) {
playCard(number);
}
 
}
);
}
 
accessToken =
localStorage.getItem(
"spotify_access_token"
);
 
handleCallback();
 
}
);
