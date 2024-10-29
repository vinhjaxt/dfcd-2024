/// <reference path="./node_modules/njs-types/ngx_http_js_module.d.ts" />

const fs = require('fs')
const cryptoN = require('crypto')
const presharedBotSecret = fs.readFileSync('/preshared_bot_secret/uuid')
const botUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0'

/* Không có custtom req/resp headers không theo chuẩn
Request:
bot gửi: uri, body, ua( Bot/1.0 + timestamp + hashmac(timestamp + uri + body) )
bot touch file: hashmac

njs check: hashmac(timestamp + uri + body) == hashmac
=> ok request => njs đổi nội dung hashbody vào file

Response:
njs gửi resp body
njs touch file: hashmac ( ua + resp body )

bot nhận: resp, tính hashmac ( ua + resp ) == nội dung file
=> xóa file
*/

function log() {
  ngx.log(ngx.WARN, '[bot check]: ' + Array.from(arguments).join(' '))
}

/**
 * @param {NginxHTTPRequest} req
 * */
function bot_log_request(req, data, flags) {
  req.sendBuffer(data, flags)
  req.done()

  const ua = req.headersIn['User-Agent']
  if (!(ua && ua.startsWith(botUA))) return // không phải bot

  const uaParts = ua.substring(botUA.length + 1).split(' ', 2)

  // Đọc request body
  let reqBody
  if (req.variables.request_body_file) {
    // req.error('Req body file:', typeof fs.readFileSync(req.variables.request_body_file))
    reqBody = fs.readFileSync(req.variables.request_body_file)
  } else {
    // req.error('Req body (string):', typeof req.variables.request_body)
    // req.error('Req buffer:', typeof req.requestBuffer)
    reqBody = req.requestBuffer
  }

  const reqBodyLen = reqBody ? reqBody.length : 0
  const dataLen = data ? data.length : 0

  // log('Uuid: ' + presharedBotSecret)
  log('Uri: ', req.variables.request_uri)
  log('Req body length: ', reqBodyLen)
  log('Resp body/1 length: ', dataLen)

  // log('Req body:', Buffer.from(reqBody).toString('utf8'))

  // const mac = await crypto.subtle.digest('SHA-256', req_body)
  // log(Buffer.from(mac).toString('hex'))

  const mac = cryptoN.createHmac('md5', presharedBotSecret)
    .update(uaParts[0] || '') // timestamp
    .update(req.variables.request_uri)
    .update(reqBody || '')
  const reqHashmac = mac.digest('hex')

  try {
    fs.appendFileSync('/bot-log/srv-send-received.log', JSON.stringify({
      ua,
      uri: req.variables.uri,
      reqBody: reqBody ? Buffer.from(reqBody.slice(0, 1024)).toString('base64') : '',
      reqBodyLen,
      respBody1: data ? Buffer.from(data.slice(0, 1024)).toString('base64') : '',
      respBody1Len: dataLen,
      reqHashmac // hashmac đúng
    }) + ' <== (server nhận) \n\n')
  } catch (e) { }

  if (reqHashmac != uaParts[1]/*req hashmac*/) {
    // có thể do người dùng gửi để giả mạo bot
    // có thể defense sai dẫn tới chặn bot
    log('request not verified', ua, reqHashmac)
    return
  }

  try {
    // request ok
    fs.accessSync('/preshared_bot_secret/req-' + reqHashmac, fs.constants.W_OK)

    const mac = cryptoN.createHmac('md5', presharedBotSecret)
    mac.update(ua) // old req
    mac.update(data || '')
    const respHashmac = mac.digest('hex')

    fs.writeFileSync('/preshared_bot_secret/req-' + reqHashmac, dataLen + '\n' + respHashmac)
    log('request ok', ua, reqHashmac)

  } catch (e) {
    log('request ok but done', ua, reqHashmac)
  }

}

export default { bot_log_request }