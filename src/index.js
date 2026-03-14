export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/mission/event") {
      const body = await request.json();
      return handleEvent(body, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  }
};

/* =========================================================
   EVENT HANDLER
========================================================= */

async function handleEvent(input, env, ctx) {
  const { mission_id, event_type } = input;

  if (!mission_id || !event_type) {
    return json({ error: "invalid payload" }, 400);
  }

  const mission = await getMission(mission_id, env);

  const updated = {
    ...mission,
    mission_id,
    last_event: event_type,
    updated_at: Date.now()
  };

  await updateMission(updated, env);

  /* =========================================
     TRIGGER PIVOT ENGINE
  ========================================= */

  ctx.waitUntil(
    env["icc-pivot-engine"].fetch("https://icc-pivot-engine/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mission_id })
    })
  );

  /* =========================================
     BROADCAST EVENT
  ========================================= */

  ctx.waitUntil(
    env["mission-comms"].fetch("https://mission-comms/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mission_id,
        event: event_type
      })
    })
  );

  return json({
    status: "EVENT_PROCESSED",
    mission_id
  });
}

/* =========================================================
   MISSION STATE ACCESS
========================================================= */

async function getMission(id, env) {
  const doId = env.MISSION_STATE.idFromName(id);
  const stub = env.MISSION_STATE.get(doId);

  const res = await stub.fetch("https://mission/mission/state");

  return res.json();
}

async function updateMission(mission, env) {
  const doId = env.MISSION_STATE.idFromName(mission.mission_id);
  const stub = env.MISSION_STATE.get(doId);

  await stub.fetch("https://mission/mission/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(mission)
  });
}

/* =========================================================
   RESPONSE HELPER
========================================================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}