import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// KEENONCOINS — SILVER CAPTURE STATION
// Uses the EXISTING SWISH / OnSpace backend.
// No second database.
// ============================================================

const CONFIG = {
  SUPABASE_URL: "https://iwgaqieyoahmcjfziwga.backend.onspace.ai",

  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODkwNjM4MTgsImV4cCI6MjEwNDQyMzgxOCwicmVmIjoiaXdnYXFpZXlvYWhtY2pmeml3Z2EiLCJyb2xlIjoiYW5vbiIsImlzcyI6Im9uc3BhY2UifQ.cioQ38guPLFAbl3x48mUaJcMSxU5IpZn7-H-JhtvXJc",

  IDENTIFY_FUNCTION: "swish-identify",
  VALUE_FUNCTION: "swish-market-value",
  IMAGE_BUCKET: "item-images"
};

const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// ============================================================
// HELPERS
// ============================================================

const $ = id => document.getElementById(id);

const state = {
  stream: null,
  side: "obverse",
  obverse: null,
  reverse: null,
  assessment: null,
  tenantId: null,
  user: null,
  connected: false,
  busy: false
};

// IMPORTANT:
// The current HTML does not contain an element called #status.
// The old function therefore crashed when Connect was pressed.
// This version safely updates the UI without requiring #status.

function setStatus(message) {
  const status = $("status");

  if (status) {
    status.textContent = message;
    return;
  }

  const connectButton = $("swishConnect");

  if (connectButton) {
    connectButton.dataset.status = message;

    if (!state.connected) {
      connectButton.title = message;
    }
  }

  const cameraMessage = $("cameraMessage");

  if (
    cameraMessage &&
    (
      message.includes("Camera") ||
      message.includes("connected") ||
      message.includes("captured") ||
      message.includes("failed")
    )
  ) {
    cameraMessage.textContent = message;
  }
}

function setMessage(message) {
  const el = $("cameraMessage");
  if (el) el.textContent = message;
}

function setBusy(value) {
  state.busy = value;

  [
    "identify",
    "value",
    "save",
    "capture",
    "startCamera"
  ].forEach(id => {
    const el = $(id);

    if (!el) return;

    if (id === "capture") {
      el.disabled = value || !state.stream;
    } else {
      el.disabled = value;
    }
  });
}

function setConnectionText() {
  const button = $("swishConnect");

  if (!button) return;

  button.textContent = state.connected
    ? "SWISH connected"
    : "Connect SWISH";

  button.classList.toggle("connected", state.connected);
}

function showLogin(show = true) {
  const panel = $("loginPanel");

  if (!panel) return;

  panel.classList.toggle("hidden", !show);

  if (show) {
    setTimeout(() => {
      $("loginEmail")?.focus();
    }, 100);
  }
}

function showError(title, message, detail = "") {
  const panel = $("errorPanel");

  if (!panel) {
    alert(`${title}\n\n${message}`);
    return;
  }

  $("errorTitle").textContent = title;
  $("errorMessage").textContent = message;
  $("errorDetail").textContent = detail;

  panel.classList.remove("hidden");
}

function clearError() {
  $("errorPanel")?.classList.add("hidden");
}

// ============================================================
// FUNCTION ERROR READER
// ============================================================

async function readableFunctionError(error) {
  let message = error?.message || "SWISH function failed";
  let detail = "";

  try {
    if (error?.context) {
      detail = await error.context.clone().text();

      if (detail) {
        try {
          const json = JSON.parse(detail);

          message =
            json.error ||
            json.message ||
            message;

          detail = JSON.stringify(json, null, 2);
        } catch {
          // Response was not JSON.
        }
      }
    }
  } catch {
    // Keep original error.
  }

  return {
    msg: message,
    detail
  };
}

// ============================================================
// TENANT / SWISH CONNECTION
// ============================================================

async function getTenant() {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(
      `Unable to read SWISH account: ${userError.message}`
    );
  }

  if (!user) return null;

  const {
    data,
    error
  } = await supabase
    .from("tenants")
    .select("id,name")
    .order("created_at", {
      ascending: true
    })
    .limit(1);

  if (error) {
    throw new Error(
      `SWISH account found, but tenant lookup failed: ${error.message}`
    );
  }

  return data?.[0] || null;
}

async function loadConnection() {
  try {
    setStatus("Checking SWISH connection…");

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user) {
      state.connected = false;
      state.user = null;
      state.tenantId = null;

      setConnectionText();
      setStatus("Connect SWISH");

      updateButtons();

      return false;
    }

    state.user = session.user;

    const tenant = await getTenant();

    if (!tenant) {
      throw new Error(
        "This SWISH account has no business/tenant yet."
      );
    }

    state.tenantId = tenant.id;
    state.connected = true;

    setConnectionText();

    setStatus("SWISH connected · Ready");

    showLogin(false);

    updateButtons();

    return true;

  } catch (error) {

    console.error("SWISH connection error:", error);

    state.connected = false;
    state.tenantId = null;

    setConnectionText();

    setStatus("SWISH connection needs attention");

    showError(
      "SWISH connection",
      error.message || String(error)
    );

    updateButtons();

    return false;
  }
}

// ============================================================
// CONNECT BUTTON
// ============================================================

async function connectSwish(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  clearError();

  if (state.connected) {

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error(error);
    }

    state.connected = false;
    state.tenantId = null;
    state.user = null;

    setConnectionText();
    setStatus("Disconnected");

    showLogin(true);

    updateButtons();

    return;
  }

  showLogin(true);
}

// ============================================================
// LOGIN
// ============================================================

async function login(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  clearError();

  const email =
    $("loginEmail")?.value.trim() || "";

  const password =
    $("loginPassword")?.value || "";

  if (!email || !password) {
    showError(
      "Login required",
      "Enter your SWISH email and password."
    );

    return;
  }

  const button = $("loginBtn");

  // Immediate feedback on iPhone.
  if (button) {
    button.disabled = true;
    button.textContent = "Connecting…";
  }

  setStatus("SWISH · Signing in…");

  try {

    const result = await Promise.race([

      supabase.auth.signInWithPassword({
        email,
        password
      }),

      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              "SWISH sign-in timed out after 15 seconds. Check your internet connection and try again."
            )
          );
        }, 15000);
      })

    ]);

    if (result?.error) {
      throw result.error;
    }

    const connected = await loadConnection();

    if (!connected) {
      return;
    }

    $("loginPassword").value = "";

    showLogin(false);

    setStatus("SWISH connected · Ready");

  } catch (error) {

    console.error(
      "SWISH login error:",
      error
    );

    showError(
      "SWISH login failed",
      error.message || String(error),
      "If the email and password are correct, this indicates a SWISH authentication/backend connection problem."
    );

    setStatus("Login failed");

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Connect";
    }

    updateButtons();
  }
}

// ============================================================
// CAMERA
// ============================================================

async function startCamera() {
  clearError();

  try {

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera API unavailable in this browser."
      );
    }

    state.stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          },
          width: {
            ideal: 1920
          },
          height: {
            ideal: 1080
          }
        },
        audio: false
      });

    const camera = $("camera");

    camera.srcObject = state.stream;

    await camera.play();

    $("startCamera").textContent =
      "Camera running";

    setMessage(
      "Centre the coin in the guide"
    );

    setStatus(
      state.connected
        ? "SWISH connected · Camera ready"
        : "Camera ready · Connect SWISH before identifying"
    );

    updateButtons();

  } catch (error) {

    console.error(
      "Camera error:",
      error
    );

    setMessage(
      "Camera unavailable — use Photo instead"
    );

    setStatus("Photo mode");

    showError(
      "Camera unavailable",
      error.message || String(error),
      "You can still use Photo to capture each side."
    );
  }
}

// ============================================================
// CAPTURE
// ============================================================

function makeCapture() {
  const video = $("camera");
  const canvas = $("canvas");

  if (!video?.videoWidth) {
    showError(
      "Camera not ready",
      "Start the camera before pressing Capture."
    );

    return null;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context =
    canvas.getContext("2d");

  context.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL(
    "image/jpeg",
    0.86
  );
}

function storeShot(data) {
  if (!data) return;

  if (state.side === "obverse") {

    state.obverse = data;

    $("obversePreview").src = data;

    state.side = "reverse";

    $("sideLabel").textContent =
      "REVERSE";

    $("nextSide").textContent =
      "Switch to obverse";

  } else {

    state.reverse = data;

    $("reversePreview").src = data;

    state.side = "obverse";

    $("sideLabel").textContent =
      "OBVERSE";

    $("nextSide").textContent =
      "Switch to reverse";
  }

  $("nextSide").disabled = false;

  updateButtons();

  if (
    state.obverse &&
    state.reverse
  ) {

    setStatus(
      state.connected
        ? "SWISH connected · Both sides captured"
        : "Both sides captured · Connect SWISH"
    );

  } else {

    setStatus("Side captured");
  }
}

// ============================================================
// COIN DETAILS
// ============================================================

function details() {
  return {
    weight_g:
      parseFloat(
        $("weight")?.value
      ) || null,

    diameter_mm:
      parseFloat(
        $("diameter")?.value
      ) || null,

    metal:
      $("metal")?.value || "Unknown",

    notes:
      $("notes")?.value.trim() || ""
  };
}

function imageList() {
  return [
    state.obverse,
    state.reverse
  ].filter(Boolean);
}

function knownAttributes() {
  const d = details();

  return {
    weight: d.weight_g,
    diameter: d.diameter_mm,
    material: d.metal,
    customNotes: d.notes
  };
}

// ============================================================
// BUTTON STATES
// ============================================================

function updateButtons() {

  const captured =
    !!(
      state.obverse &&
      state.reverse
    );

  const identifyButton =
    $("identify");

  const valueButton =
    $("value");

  const saveButton =
    $("save");

  if (identifyButton) {
    identifyButton.disabled =
      state.busy ||
      !captured ||
      !state.connected;
  }

  if (valueButton) {
    valueButton.disabled =
      state.busy ||
      !state.assessment?.rawIdentification ||
      !state.connected;
  }

  if (saveButton) {
    saveButton.disabled =
      state.busy ||
      !state.assessment?.rawIdentification ||
      !state.connected;
  }

  const captureButton =
    $("capture");

  if (captureButton) {
    captureButton.disabled =
      state.busy ||
      !state.stream;
  }

  const cameraButton =
    $("startCamera");

  if (cameraButton) {
    cameraButton.disabled =
      state.busy;
  }
}

// ============================================================
// RESULT DISPLAY
// ============================================================

function renderAssessment() {

  const assessment =
    state.assessment || {};

  const identification =
    assessment.rawIdentification
      ?.identification || {};

  const numista =
    assessment.rawIdentification
      ?.numistaVerification || {};

  const resultBody =
    $("resultBody");

  if (!resultBody) return;

  resultBody.innerHTML = "";

  const dl =
    document.createElement("dl");

  const rows = [

    [
      "Identification",
      assessment.identification ||
        "Not established"
    ],

    [
      "Confidence",
      assessment.confidence != null
        ? `${assessment.confidence}%`
        : "Not established"
    ],

    [
      "Identification state",
      identification.identificationState ||
        "—"
    ],

    [
      "Numista",
      assessment.reference ||
        "Not verified"
    ],

    [
      "Quick-sale value",
      assessment.quick_sale_value != null
        ? `£${assessment.quick_sale_value}`
        : "Not calculated"
    ],

    [
      "Reasoning",
      assessment.reasoning || ""
    ]

  ];

  if (
    identification
      .candidateIdentification
      ?.alternativeCandidates
      ?.length
  ) {

    rows.push([
      "Alternatives",
      identification
        .candidateIdentification
        .alternativeCandidates
        .join(" · ")
    ]);
  }

  if (
    numista.matchScore != null
  ) {

    rows.push([
      "Numista match",
      `${numista.matchScore}/100 · ${
        numista.status || "unknown"
      }`
    ]);
  }

  if (
    Array.isArray(
      identification.evidenceSupporting
    ) &&
    identification.evidenceSupporting.length
  ) {

    rows.push([
      "Evidence",
      identification
        .evidenceSupporting
        .join(" · ")
    ]);
  }

  rows.forEach(([key, value]) => {

    const dt =
      document.createElement("dt");

    const dd =
      document.createElement("dd");

    dt.textContent = key;

    dd.textContent =
      value || "—";

    dl.append(
      dt,
      dd
    );
  });

  resultBody.append(dl);

  $("result")
    ?.classList
    .remove("hidden");
}

// ============================================================
// IDENTIFICATION
// ============================================================

async function identify() {

  clearError();

  if (!state.connected) {

    showLogin(true);

    showError(
      "Connect SWISH first",
      "The capture is ready, but the SWISH identification engine requires your authenticated SWISH session."
    );

    return;
  }

  if (
    !state.obverse ||
    !state.reverse
  ) {

    showError(
      "Two sides required",
      "Capture both obverse and reverse before identifying."
    );

    return;
  }

  setBusy(true);

  setStatus(
    "SWISH · Preparing identification…"
  );

  try {

    const {
      data,
      error
    } =
      await supabase.functions.invoke(
        CONFIG.IDENTIFY_FUNCTION,
        {
          body: {
            images: imageList(),

            specialistId:
              "coins",

            tenantId:
              state.tenantId,

            knownAttributes:
              knownAttributes()
          }
        }
      );

    if (error) {

      const readable =
        await readableFunctionError(
          error
        );

      throw new Error(
        `${readable.msg}\n${readable.detail}`
      );
    }

    if (
      !data?.identification
    ) {

      throw new Error(
        data?.error ||
          "SWISH returned no identification data."
      );
    }

    const identification =
      data.identification;

    const numista =
      data.numistaVerification || {};

    state.assessment = {

      rawIdentification:
        data,

      identification:
        identification.canonicalTitle ||
        identification
          .candidateIdentification
          ?.primaryCandidate ||
        "Not established",

      confidence:
        Math.round(
          Number(
            identification.confidence || 0
          ) * 100
        ),

      reference:
        identification.numistaN ||
        numista.numistaN ||
        (
          numista.typeId
            ? `N#${numista.typeId}`
            : "—"
        ),

      reasoning: [
        identification.identificationState
          ? `State: ${identification.identificationState}`
          : "",

        identification.confidenceReason ||
          "",

        numista.status
          ? `Numista: ${numista.status}${
              numista.matchScore != null
                ? ` (${numista.matchScore}/100)`
                : ""
            }`
          : "",

        ...(identification.warnings || [])
      ]
        .filter(Boolean)
        .join(" · ")
    };

    renderAssessment();

    setStatus(
      "SWISH · Identification complete"
    );

  } catch (error) {

    console.error(
      "Identification error:",
      error
    );

    setStatus(
      "Identification failed"
    );

    showError(
      "SWISH identification failed",
      error.message || String(error),
      "The request reached the Capture Station, but SWISH did not return a usable identification. No coin was saved."
    );

  } finally {

    setBusy(false);

    updateButtons();
  }
}

// ============================================================
// VALUATION
// ============================================================

async function value() {

  clearError();

  if (
    !state.assessment
      ?.rawIdentification
  ) {

    showError(
      "Identify first",
      "Run identification before valuation."
    );

    return;
  }

  setBusy(true);

  setStatus(
    "SWISH · Searching market evidence…"
  );

  try {

    const raw =
      state.assessment
        .rawIdentification;

    const identification =
      raw.identification || {};

    const numista =
      raw.numistaVerification || {};

    const {
      data,
      error
    } =
      await supabase.functions.invoke(
        CONFIG.VALUE_FUNCTION,
        {
          body: {

            tenantId:
              state.tenantId,

            title:
              identification.canonicalTitle ||
              "Unknown coin",

            specialistId:
              "coins",

            attributes: {
              ...(identification.attributes || {}),
              ...(identification.coinFields || {})
            },

            condition:
              identification.condition ||
              "Cannot be reliably graded from supplied images",

            identificationConfidence:
              Number(
                identification.confidence || 0
              ),

            identificationTier:
              identification.confidenceTier ||
              "low",

            numistaTypeId:
              identification.numistaTypeId ||
              numista.typeId ||
              null,

            numistaMatchScore:
              Number(
                numista.matchScore ||
                identification.numistaMatchScore ||
                0
              ),

            numistaMatchTier:
              numista.status ||
              identification.numistaStatus ||
              "no_match",

            applyToItem:
              false
          }
        }
      );

    if (error) {

      const readable =
        await readableFunctionError(
          error
        );

      throw new Error(
        `${readable.msg}\n${readable.detail}`
      );
    }

    if (!data) {

      throw new Error(
        "SWISH returned no valuation data."
      );
    }

    const quickSaleValue =
      data.quickSaleValue ??
      data.quick_sale_value ??
      data.valuation?.quickSaleValue ??
      data.valuation?.quick_sale_value ??
      data.valuation?.recommendedListingPrice ??
      data.recommendedListingPrice ??
      null;

    state.assessment.valuation =
      data;

    state.assessment.quick_sale_value =
      quickSaleValue;

    state.assessment.reasoning =
      (
        state.assessment.reasoning ||
        ""
      ) +
      (
        quickSaleValue != null
          ? ` · SWISH market evidence returned £${quickSaleValue}.`
          : " · SWISH returned no quick-sale figure."
      );

    renderAssessment();

    setStatus(
      "SWISH · Valuation complete"
    );

  } catch (error) {

    console.error(
      "Valuation error:",
      error
    );

    setStatus(
      "Valuation failed"
    );

    showError(
      "SWISH valuation failed",
      error.message || String(error),
      "Identification has not been altered. Nothing was saved."
    );

  } finally {

    setBusy(false);

    updateButtons();
  }
}

// ============================================================
// IMAGE UPLOAD
// ============================================================

async function uploadImages(itemId) {

  const urls = [];

  const images =
    imageList();

  for (
    let i = 0;
    i < images.length;
    i++
  ) {

    const data =
      images[i];

    const side =
      i === 0
        ? "obverse"
        : "reverse";

    const path =
      `${itemId}/${i + 1}_${side}.jpg`;

    const response =
      await fetch(data);

    const blob =
      await response.blob();

    const {
      error
    } =
      await supabase.storage
        .from(CONFIG.IMAGE_BUCKET)
        .upload(
          path,
          blob,
          {
            contentType:
              "image/jpeg",
            upsert:
              true
          }
        );

    if (error) {
      throw error;
    }

    const publicUrl =
      supabase.storage
        .from(CONFIG.IMAGE_BUCKET)
        .getPublicUrl(path)
        .data
        .publicUrl;

    urls.push(publicUrl);
  }

  return urls;
}

// ============================================================
// SAVE TO SWISH
// ============================================================

async function save() {

  clearError();

  if (
    !state.assessment
      ?.rawIdentification
  ) {

    showError(
      "Identify first",
      "There is no identification to save."
    );

    return;
  }

  setBusy(true);

  setStatus(
    "SWISH · Saving coin…"
  );

  try {

    const raw =
      state.assessment
        .rawIdentification;

    const identification =
      raw.identification || {};

    const valuation =
      state.assessment
        .valuation || {};

    const d =
      details();

    const attributes = {

      ...(identification.attributes || {}),

      ...(identification.coinFields || {}),

      object_type:
        identification.objectType ||
        "coin",

      identification_state:
        identification.identificationState ||
        "observation_only",

      weight_g:
        d.weight_g,

      diameter_mm:
        d.diameter_mm,

      metal:
        d.metal,

      notes:
        d.notes,

      numista_type_id:
        identification.numistaTypeId ||
        raw.numistaVerification?.typeId ||
        null,

      numista_n:
        identification.numistaN ||
        raw.numistaVerification?.numistaN ||
        null,

      numista_url:
        identification.numistaUrl ||
        raw.numistaVerification?.numistaUrl ||
        null
    };

    const {
      data: item,
      error
    } =
      await supabase
        .from("items")
        .insert({

          tenant_id:
            state.tenantId,

          canonical_title:
            identification.canonicalTitle ||
            "Unidentified coin",

          description:
            identification.condition
              ? `Condition: ${identification.condition}`
              : "",

          specialist_id:
            "coins",

          status:
            (
              identification.identificationState ===
                "observation_only" ||
              Number(
                identification.confidence || 0
              ) < 0.30
            )
              ? "review_required"
              : Number(
                  identification.confidence || 0
                ) >= 0.80
                ? "identified"
                : "review_required",

          disposition_decision:
            identification.dispositionDecision ||
            "sell_individual",

          condition:
            identification.condition ||
            "Cannot be reliably graded from supplied images",

          condition_grade:
            identification.conditionGrade ||
            "",

          condition_notes:
            identification.conditionNotes ||
            "",

          identification_confidence:
            Number(
              identification.confidence || 0
            ),

          identification_source:
            identification.identificationSource ||
            "researched",

          valuation_low:
            Number(
              valuation.valuationLow ??
              valuation.low ??
              0
            ),

          valuation_mid:
            Number(
              valuation.valuationMid ??
              valuation.mid ??
              state.assessment
                .quick_sale_value ??
              0
            ),

          valuation_high:
            Number(
              valuation.valuationHigh ??
              valuation.high ??
              0
            ),

          valuation_confidence:
            valuation.valuationConfidence ||
            "unknown",

          expected_selling_price:
            Number(
              valuation.recommendedListingPrice ??
              state.assessment
                .quick_sale_value ??
              0
            ),

          expected_net:
            0,

          expected_profit:
            0,

          sale_prob_30d:
            Number(
              valuation.saleProb30d ??
              0
            ),

          attributes,

          media: [],

          warnings:
            Array.isArray(
              identification.warnings
            )
              ? identification.warnings
              : [],

          tags: [],

          acquired_cost:
            0

        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    try {

      const urls =
        await uploadImages(item.id);

      const {
        error: imageUpdateError
      } =
        await supabase
          .from("items")
          .update({
            media:
              urls,

            updated_at:
              new Date()
                .toISOString()
          })
          .eq(
            "id",
            item.id
          )
          .eq(
            "tenant_id",
            state.tenantId
          );

      if (imageUpdateError) {
        throw imageUpdateError;
      }

    } catch (imageError) {

      showError(
        "Coin saved, photos need attention",
        "The coin record was saved to SWISH, but the photo upload failed.",
        imageError.message ||
          String(imageError)
      );
    }

    setStatus(
      "Saved to SWISH ✓"
    );

    alert(
      `Saved to SWISH\n\n${
        identification.canonicalTitle ||
        "Unidentified coin"
      }`
    );

  } catch (error) {

    console.error(
      "Save error:",
      error
    );

    setStatus(
      "Save failed"
    );

    showError(
      "SWISH save failed",
      error.message || String(error),
      "No separate database is being used. The existing SWISH database remains the source of truth."
    );

  } finally {

    setBusy(false);

    updateButtons();
  }
}

// ============================================================
// EVENT WIRING
// ============================================================

function wire(id, event, handler) {

  const element =
    $(id);

  if (!element) {
    console.warn(
      `KeenOnCoins: element #${id} not found`
    );
    return;
  }

  element.addEventListener(
    event,
    handler,
    {
      passive: false
    }
  );
}

function initialise() {

  // IMPORTANT:
  // Only ONE click handler for Connect.
  // No duplicate touchend handler.

  wire(
    "swishConnect",
    "click",
    connectSwish
  );

  wire(
    "loginBtn",
    "click",
    login
  );

  wire(
    "loginCancel",
    "click",
    () => showLogin(false)
  );

  wire(
    "startCamera",
    "click",
    startCamera
  );

  wire(
    "capture",
    "click",
    () => {

      const data =
        makeCapture();

      if (data) {
        storeShot(data);
      }
    }
  );

  wire(
    "nextSide",
    "click",
    () => {

      state.side =
        state.side === "obverse"
          ? "reverse"
          : "obverse";

      $("sideLabel").textContent =
        state.side.toUpperCase();

    }
  );

  wire(
    "photoInput",
    "change",
    event => {

      const file =
        event.target.files?.[0];

      if (!file) return;

      const reader =
        new FileReader();

      reader.onload = () => {

        storeShot(
          reader.result
        );

      };

      reader.readAsDataURL(file);
    }
  );

  wire(
    "identify",
    "click",
    identify
  );

  wire(
    "value",
    "click",
    value
  );

  wire(
    "save",
    "click",
    save
  );

  wire(
    "retryConnection",
    "click",
    () => {

      clearError();

      loadConnection();
    }
  );

  window.addEventListener(
    "beforeunload",
    () => {

      state.stream
        ?.getTracks()
        .forEach(
          track =>
            track.stop()
        );
    }
  );

  supabase.auth.onAuthStateChange(
    () => {

      setTimeout(
        loadConnection,
        0
      );
    }
  );

  loadConnection()
    .finally(
      updateButtons
    );
}

// ============================================================
// START APP
// ============================================================

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initialise,
    {
      once: true
    }
  );

} else {

  initialise();
}
