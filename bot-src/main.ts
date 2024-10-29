#!/usr/bin/env deno --allow-all --unstable-net --watch --no-clear-screen
import FormData from 'npm:form-data'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'

process.on('uncaughtException', err => {
  console.error((new Date()).toUTCString(), 'uncaughtException:', err)
  process.exit(1)
})
process.on('SIGINT', err => {
  console.error((new Date()).toUTCString(), 'SIGINT:', err)
  process.exit(1)
})
process.on('SIGTERM', err => {
  console.error((new Date()).toUTCString(), 'SIGTERM:', err)
  process.exit(1)
})

process.on('ELIFECYCLE', err => {
  console.error((new Date()).toUTCString(), 'ELIFECYCLE:', err)
  process.exit(1)
})
process.on('unhandledRejection', err => {
  console.error((new Date()).toUTCString(), 'unhandledRejection:', err)
  process.exit(1)
})

const botConfig = JSON.parse(Deno.readTextFileSync('/bot_config/config.json'))
botConfig.TEAM_SERVICE_URL = 'http://host.docker.internal'
const botUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0`

// /*
const testRun = true

if (!testRun) {
  botConfig.time = await fetchTimeout(new URL('/user/bot_event_info', botConfig.SERVER_URL), {
    headers: {
      authorization: 'Bearer ' + botConfig.TOKEN
    },
    timeout: 7000
  }).then(r => r.json())
  if (botConfig.current_round == 0) {
    console.log('Chưa start..')
    process.exit(1)
  }
  botConfig.TEAM_SERVICE_URL = await fetchTimeout(new URL('/admin/services/' + botConfig.SERVICE_ID, botConfig.SERVER_URL), {
    headers: {
      authorization: 'Bearer ' + botConfig.TOKEN
    },
    timeout: 7000
  }).then(r => r.json()).then(r => r.url)
  console.log(botConfig)
}
// */

function randomChars(length, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_') {
  let result = '';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fetchTimeout(input: string | URL | Request, init?: RequestInit) {
  if (!init) init = {}
  const ac = new AbortController()
  let tick = setTimeout(() => {
    tick = undefined
    ac.abort('timeout')
  }, init?.timeout || 60000)
  init.signal = ac.signal

  try {
    const r = await fetch(input, init)
    return r
  } catch (e) {
    throw e
  } finally {
    if (tick) clearTimeout(tick)
  }
}

function randItem(items) {
  // "|" for a kinda "int div"
  return items[items.length * Math.random() | 0];
}

const team_url = new URL(botConfig.TEAM_SERVICE_URL)

// setup each startups
console.log(new Date, 'setup')

const presharedBotSecret = crypto.randomUUID()
Deno.writeTextFileSync('/preshared_bot_secret/uuid', presharedBotSecret)

console.log(new Date, 'check services..')

// mỗi 10s
async function checkResponse(service: string, input: string, opts: RequestInit = {}) {
  try {
    const reqUrl = new URL(input, team_url)
    const reqBody = opts.body || ''
    // console.log(service, reqUrl.href.replace(reqUrl.origin, ''), reqBody.toString('utf8'))

    const timestamp = Date.now()
    const uri = reqUrl.href.replace(reqUrl.origin, '/').replace('//', '/')
    const localReqHash = crypto.createHmac('md5', presharedBotSecret)
      .update(timestamp.toString())
      .update(uri)
      .update(reqBody)
      .digest('hex')

    Deno.writeTextFileSync('/preshared_bot_secret/req-' + localReqHash, '', {
      mode: 0o777,
    })

    const ua = botUA + ' ' + timestamp + ' ' + localReqHash
    if (opts.headers) opts.headers['user-agent'] = ua
    else opts.headers = { 'User-Agent': ua }

    try {
      Deno.writeTextFileSync('/bot-log/bot-send-received.log', JSON.stringify({
        ua,
        uri,
        reqBody: reqBody ? Buffer.from(reqBody.slice(0, 1024)).toString('base64') : '',
        reqBodyLen: reqBody.length,
        reqHashmac: localReqHash // hashmac đúng
      }) + ' ==> (gửi) \n\n', {
        append: true
      })
    } catch (e) { }

    const r = await fetchTimeout(reqUrl, opts)

    const body = Buffer.from(await r.arrayBuffer())

    // read resp
    let localRespHash
    try {
      localRespHash = Deno.readTextFileSync('/preshared_bot_secret/req-' + localReqHash).split('\n')
      Deno.removeSync('/preshared_bot_secret/req-' + localReqHash)
    } catch (e) {
      throw new Error('Request chưa tới được server')
    }

    try {
      Deno.writeTextFileSync('/bot-log/bot-send-received.log', JSON.stringify({
        respBody1: body ? Buffer.from(body.slice(0, 1024)).toString('base64') : '',
        respBody1Len: body.length,
        respHashmac: localRespHash
      }) + ' ==> (bot nhận) \n\n', {
        append: true
      })
    } catch (e) { }

    if (localRespHash.length != 2) throw new Error(`Request không được server chấp nhận. Lý do: Sửa một trong các yếu tố: User-Agent, URI, Request Body`)

    const bodyPart = body.slice(0, Number(localRespHash[0]))

    const respHash = crypto.createHmac('md5', presharedBotSecret)
      .update(ua)
      .update(bodyPart)
      .digest('hex')

    if (respHash !== localRespHash[1]) {
      // console.log(body.toString())
      throw new Error(`Response trả về sai. Lý do: Sửa response body`)
    }

    if (['checkPHPUploadLog-stage2'].includes(service)) {
      if (r.status >= 400) throw new Error('Status code trả về ' + r.status + ' chức năng ko hoạt động')
    }

    console.log(service, 'Up!', Object.prototype.hasOwnProperty.call(checkMap, this.checkKey) ? 'exists' : 'no exists')
    return body.toString('utf8')
  } catch (e) {
    // console.error('checkResponse:', String(e))
    if (Object.prototype.hasOwnProperty.call(checkMap, this.checkKey)) {
      checkMap[this.checkKey] = false
      await putResult.bind(this)(service, false, String(e))
    }
  }
}

async function checkStatic(service: string, input: string, opts: RequestInit = {}) {
  try {
    const reqUrl = new URL(input, team_url)

    const timestamp = Date.now()
    const localReqHash = crypto.createHmac('md5', presharedBotSecret)
      .update(timestamp.toString())
      .update(reqUrl.href.replace(reqUrl.origin, '/').replace('//', '/'))
      .digest('hex')

    const ua = botUA + ' ' + timestamp + ' ' + localReqHash
    if (opts.headers) opts.headers['user-agent'] = ua
    else opts.headers = { 'User-Agent': ua }

    const r = await fetchTimeout(reqUrl, opts)

    if (r.status != 200) throw new Error('Status code: ' + r.status)

    const resp = await r.text()
    if (service == 'checkFakeFlag' && !resp.includes(`e10adc3949ba59abbe56e057f20f883e`)) throw new Error('Response replace md5 string')

    console.log(service, 'Up!', Object.prototype.hasOwnProperty.call(checkMap, this.checkKey) ? 'exists' : 'no exists')
    return resp
  } catch (e) {
    // console.error('checkResponse:', String(e))
    if (Object.prototype.hasOwnProperty.call(checkMap, this.checkKey)) {
      checkMap[this.checkKey] = false
      await putResult.bind(this)(service, false, String(e))
    }
  }
}

const checkMap = Object.create(null)
async function checkServices(checkKey) {
  console.log('============================ check service: ' + (new Date).toLocaleString() + ' ============================ ')

  const thisCheckKey = { checkKey }

  await Promise.all([
    checkUptime.bind(thisCheckKey)(),
    checkFakeFlag.bind(thisCheckKey)(),
    checkFreeChat.bind(thisCheckKey)(),
    checkPHPUploadLog.bind(thisCheckKey)(),
    checkCreateChat.bind(thisCheckKey)(),
    checkMathSays.bind(thisCheckKey)(),
    checkAPIhttp.bind(thisCheckKey)(),
    checkChat.bind(thisCheckKey)(),
  ])
  if (!Object.prototype.hasOwnProperty.call(checkMap, checkKey)) return

  // final result
  console.log(new Date, 'done', checkMap[checkKey] || false)
  if (Object.prototype.hasOwnProperty.call(checkMap, checkKey))
    await putResult.bind(thisCheckKey)('all_service', true, 'up!')
}

async function checkUptime() {
  return checkStatic.bind(this)('checkUptime', '/')
}

async function checkFakeFlag() {
  return checkStatic.bind(this)('checkFakeFlag', '/mathsays.html')
}
async function checkFreeChat() {
  return checkStatic.bind(this)('checkFreeChat', '/free-chat.html')
}

const mathSays = JSON.parse(Deno.readTextFileSync('./mathsays.json'))
async function checkMathSays() {
  return checkResponse.bind(this)('checkMathSays', '/mathsays?t=' + randItem(mathSays))
}

const lorem = Deno.readTextFileSync('./lorem.txt')
async function checkPHPUploadLog() {
  const fd = new FormData()

  const offset = Math.random() * lorem.length - 1024

  fd.append('log', lorem.substring(offset, offset + Math.round(Math.random() * 1023)), {
    filename: randomChars(crypto.randomInt(8)) + randItem(`.txt,.rtf,.docx,.csv,.doc,.wps,.wpd,.msg,.jpg,.png,.webp,.gif,.tif,.bmp,.eps,.mp3,.wma,.snd,.wav,.ra,.au,.aac,.mp4,.3gp,.avi,.mpg,.mov,.wmv,.c,.cpp,.java,.py,.ts,.cs,.swift,.dta,.pl,.rar,.zip,.hqx,.arj,.tar,.arc,.sit,.gz,.z,.php.txt,.php.png,.dat,.jpeg,.h,.log,.log,.log,.log,.log,.log,.log,.log,.log,.log,.log,.log,.log,.log,.log,.log`.split(',')),
    contentType: 'application/octet-stream'
  })

  return checkResponse.bind(this)('checkPHPUploadLog', '/log-api/app/upload-log.php', {
    method: 'POST',
    headers: {
      ...fd.getHeaders()
    },
    body: fd.getBuffer()
  }).then(r => {
    if (!r?.startsWith(`Upload OK: `)) return
    return checkResponse.bind(this)('checkPHPUploadLog-stage2', `/log-api/logs/` + r.substring(11))
  })
}

const hhashes = JSON.parse(Deno.readTextFileSync('./hashes.json'))
async function checkAPIhttp() {
  const uri = randItem([
    'http://1.1.1.1/cdn-cgi/trace',
    'https://ifconfig.me',
    'http://echo.opera.com',
    'https://echo.opera.com',
    'https://google.com',
    'https://googlecom',
    'https://facebook.com',
    'https://facebookcom',
    `http://${randomChars(4, '0123456789')}-${(Math.floor(Math.random() * 255) + 1) + "-" + (Math.floor(Math.random() * 255)) + "-" + (Math.floor(Math.random() * 255)) + "-" + (Math.floor(Math.random() * 255))}.ngrok.io`,
    `https://${randomChars(4, '0123456789')}-${(Math.floor(Math.random() * 255) + 1) + "-" + (Math.floor(Math.random() * 255)) + "-" + (Math.floor(Math.random() * 255)) + "-" + (Math.floor(Math.random() * 255))}.ngrok.io`,
    `http://${randItem(hhashes)}-${randItem(hhashes)}-${randItem(hhashes)}-${randItem(hhashes)}.trycloudflare.com`,
    `https://${randItem(hhashes)}-${randItem(hhashes)}-${randItem(hhashes)}-${randItem(hhashes)}.trycloudflare.com`
  ])

  return checkResponse.bind(this)('checkAPIhttp', '/api/rpc/http_get', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Content-Profile': 'extensions'
    },
    body: JSON.stringify({
      uri
    })
  })
}

function checkCreateChat() {
  return checkResponse.bind(this)('checkCreateChat', '/api/chats?select=id', {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ name: randItem(hhashes) }),
  })
}

const sqlChats = JSON.parse(Deno.readTextFileSync('./sql-chat.json'))
async function checkChat() {
  const service = 'checkChat'
  try {
    const msg = await checkChatWs()
    await checkChatId.bind(this)(msg)
    // await checkChatWs()
    console.log(service, 'Up!', Object.prototype.hasOwnProperty.call(checkMap, this.checkKey) ? 'exists' : 'no exists')
  } catch (e) {
    if (Object.prototype.hasOwnProperty.call(checkMap, this.checkKey)) {
      checkMap[this.checkKey] = false
      await putResult.bind(this)(service, false, String(e))
    }
  }
}

function checkChatId(msg) {
  return checkResponse.bind(this)('checkCreateChat', '/api/messages?id=eq.' + msg.id + '&limit=1&select=msg', {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
  }).then(r => {
    if (!r) throw new Error('checkChatId failed')
    const data = JSON.parse(r)
    if (data[0]?.msg != msg.msg) throw new Error('checkChatId failed')
  })
}

async function checkChatWs() {
  const sqlChat = randItem(sqlChats)

  const wssUrl = new URL(team_url + '/ws?chat_id=' + crypto.randomInt(15))
  wssUrl.protocol = 'ws:'

  const wss = new WebSocketStream(wssUrl.href, {
    headers: {
      'User-Agent': randItem(['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.105 Safari/537.36', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.105 Safari/537.36', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'])
    }
  })

  let wait = setTimeout(() => {
    if (!wait) return
    wait = undefined
    console.log('[ws] timeout')
    try {
      wss.close()
    } catch (e) { }
  }, 7000)

  wss.closed.catch(() => {
    if (wait)
      clearTimeout(wait)
    wait = undefined
  })

  try {
    const { readable, writable } = await wss.opened
    const reader = readable.getReader()
    const writer = writable.getWriter()

    await writer.write(JSON.stringify({
      message: sqlChat
    }))

    while (true) {
      try {
        await delay(200)
        const { value, done } = await reader.read()

        if (!value) break
        if (value == 'pong') continue
        const data = JSON.parse(Buffer.from(value).toString())

        for (const d of data) {
          if (d.msg == sqlChat) {
            if (wait)
              clearTimeout(wait)
            wait = undefined

            try {
              wss.close()
            } catch (e) { }
            return d
          }
        }

        if (done) break
      } catch (e) {
        await delay(200)
      }
    }
  } catch (e) {
    throw e
  } finally {
    try {
      wss.close()
    } catch (e) { }
  }
  throw new Error('unexpected close / incomplete read')
}

function putResult(service, result, reason = '') {
  if (!Object.prototype.hasOwnProperty.call(checkMap, this.checkKey)) return
  delete checkMap[this.checkKey]

  console.log(service, result, reason, this.checkKey)
  if (testRun) return

  return fetchTimeout(new URL('/bot/report/' + botConfig.SERVICE_ID, botConfig.SERVER_URL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + botConfig.TOKEN
    },
    timeout: 7000,
    body: JSON.stringify({
      status: result,
      message: `${service}: ${reason}`
    })
  }).then(r => r.text()).catch(console.error.bind(console, 'bot report:'))
}

const intFunc = async () => {
  await delay(3000)

  const dateNow = Math.floor(Date.now() / 1000)
  if (testRun || dateNow >= botConfig.time.start_time && dateNow <= botConfig.time.end_time) {
    const checkKey = String(Math.random()) + String(Date.now())
    checkMap[checkKey] = true
    try {
      await checkServices(checkKey)
    } catch (e) {
      console.error(e)
    }
    if (Object.prototype.hasOwnProperty.call(checkMap, checkKey))
      await putResult.bind({ checkKey })('all_service', true, 'up!')
  }

  if (!testRun)
    try {
      const time = await fetchTimeout(new URL('/user/bot_event_info', botConfig.SERVER_URL), {
        headers: {
          authorization: 'Bearer ' + botConfig.TOKEN
        },
        timeout: 7000
      }).then(r => r.json())
      if (botConfig.time.current_round != time.current_round) {
        // sang round mới
        process.exit(1)
      }
    } catch (e) {
      console.error(e)
    }
}
setInterval(intFunc, 10000)
intFunc()
