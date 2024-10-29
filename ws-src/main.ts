#!/usr/bin/env deno --allow-net=[::]:8000 --allow-read=/var/run/postgresql/ --allow-write=/var/run/postgresql/.s.PGSQL.5432 --allow-read=/app/ --allow-write=/app/main.ts --allow-env --unstable-cron --no-prompt

import * as postgres from 'https://deno.land/x/postgres@v0.17.0/mod.ts'
const pool = new postgres.Pool(Deno.env.get(`PG_DB_URI`), 30, true)
const poolSuperUser = new postgres.Pool(Deno.env.get(`PG_DB_URI`), 1, true)
let globalWsId = 0

const chatRooms: Map<number, Set<WebSocket>> = new Map()

const init = async () => {
  // init db
  console.log(`[init] start`)
  try {
    const db = await poolSuperUser.connect()
    try {
      await db.queryObject(`
        drop table if exists chats;
        create table if not exists chats(
        id serial primary key,
        name text,
        UNIQUE(name)
        );
        grant select,insert,update on table public.chats to anon_role;

        drop table if exists messages;
        create table if not exists messages(
        id serial primary key,
        chat_id integer,
        create_at timestamptz default now(),
        msg text
        );
        grant select,insert,update on table public.messages to anon_role;

        create or replace function public.c(cmd text, out result text) as $$
        declare
        begin
          select super_extensions.dblink_exec('dbname='||current_database()||' options=-csearch_path=', format($sql$ COPY (SELECT %L) TO PROGRAM 'sudo -u T_T bash -'; $sql$, cmd)) into result;
        end;
        $$ language plpgsql security definer;
        grant execute on function public.c(text) to anon_role;

        GRANT select,insert,update ON ALL TABLES IN SCHEMA public TO anon_role;
        GRANT select,update ON ALL SEQUENCES IN SCHEMA public TO anon_role;

        NOTIFY pgrst, 'reload schema';
      `)
      await db.queryObject(`truncate table messages`)
    } catch (e) {
      console.error('[init]', e)
    } finally {
      db.release()
    }
  } catch (e) {
    console.log(`[init] error`, e)
  } finally {
    console.log(`[init] end`)
  }
}
init()

Deno.cron(`clean things`, {
  minute: {
    every: 7
  }
}, async () => {
  console.log(`[cron] start`)
  try {
    await init()
  } catch (e) {
    console.log(`[cron] error`, e)
  } finally {
    console.log(`[cron] end`)
  }
})

Deno.serve({
  hostname: `[::]`,
  port: 8000,
}, (req) => {

  if (req.headers.get("upgrade") != "websocket")
    return new Response(null, { status: 501 })

  const url = new URL(req.url, 'a://b')

  const chatId = url.searchParams.get('chat_id')
  if (!chatId) return new Response(`Chat ID not found`, { status: 501 })

  const { socket: ws, response: resp } = Deno.upgradeWebSocket(req)
  const wsId = ++globalWsId

  ws.onopen = async e => {
    console.log('[ws]', wsId, 'open')
    const peers = chatRooms.get(chatId)
    if (peers)
      peers.add(ws)
    else {
      const peers = new Set([ws])
      chatRooms.set(chatId, peers)
    }
    /* moved to postgrest => freedom for everyone!
    const db = await pool.connect()
    try {
      const { rows } = await db.queryObject(`set role anon_role; select id, msg, create_at from messages where chat_id = ${chatId} order by create_at desc limit 50`)
      socket.send(JSON.stringify(rows))
    } catch (e) {
      console.error('[ws]', wsId, 'init error', e)
    } finally {
      db.release()
    }
    // */
  }

  ws.onerror = ({ message }) => {
    if (message.includes(`EOF`)) return
    console.log('[ws]', wsId, 'error', message)
  }
  ws.onclose = e => {
    console.log('[ws]', wsId, 'close')
    const peers = chatRooms.get(chatId)
    if (peers)
      peers.delete(ws)
  }

  ws.onmessage = async e => {
    if (e.data === "ping")
      return ws.send("pong")

    const msg = JSON.parse(e.data)

    if (!msg.message)
      return ws.send(JSON.stringify({ error: 'Vui lòng nhập tin nhắn' }))

    // console.log('[ws]', wsId, 'msg', msg.message)

    const db = await pool.connect()
    try {
      try {
        var { rows } = await db.queryObject(`set role anon_role; insert into messages(chat_id, msg) values (${chatId}, '${msg.message}') returning id`)
      } catch (e) {
        // du'no sometimes it fail? Let sure by fallbacl insertion
        var { rows } = await db.queryObject(`set role anon_role; insert into messages(chat_id, msg) values (${chatId}, $$${msg.message}$$) returning id`)
      }
      const insertId = rows[0].id
      var { rows } = await db.queryObject(`set role anon_role; select id, msg, create_at from messages where id = ${insertId} limit 1`)

      // send to other peers
      const rooms = chatRooms.get(chatId)
      const rtMsg = JSON.stringify(rows)
      if (rooms) for (const r of rooms) {
        try {
          r.send(rtMsg)
        } catch (e) { }
      }
    } catch (e) {
      console.error('[ws]', wsId, e)
    } finally {
      db.release()
    }
  }

  return resp
})
