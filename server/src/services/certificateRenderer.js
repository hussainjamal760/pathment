const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function resolveImageUrl(urlStr) {
  if (!urlStr) return '';
  if (urlStr.startsWith('data:') || urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
    return urlStr;
  }
  if (urlStr.startsWith('/')) {
    const publicPath = path.join(__dirname, '../../../client-interface/public', urlStr);
    if (fs.existsSync(publicPath)) {
      const ext = path.extname(publicPath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.svg') mimeType = 'image/svg+xml';
      else if (ext === '.webp') mimeType = 'image/webp';

      const base64 = fs.readFileSync(publicPath).toString('base64');
      return `data:${mimeType};base64,${base64}`;
    }
    const frontendHost = process.env.CLIENT_URL || 'http://localhost:3000';
    return `${frontendHost}${urlStr}`;
  }
  return urlStr;
}

function compileHtml(template, data) {
  const rawBgUrl = template.bgImageUrl || template.bg_image_url || '';
  const bgImageUrl = resolveImageUrl(rawBgUrl);
  const rawLogoUrl = template.logoUrl || template.logo_url || '';
  const logoUrl = resolveImageUrl(rawLogoUrl);
  const logoConfig = template.logoConfig || template.logo_config || { xPercent: 10, yPercent: 10, widthPercent: 15 };
  const elements = Array.isArray(template.config) ? template.config : [];

  const elementsHtml = elements.map((el) => {
    if (el.type === 'badge') {
      const left = el.xPercent != null ? el.xPercent : 50;
      const top = el.yPercent != null ? el.yPercent : 50;
      const width = el.widthPercent || 15;
      const badgeResolved = resolveImageUrl(el.badgeUrl);
      return `
        <div style="
          position: absolute;
          left: ${left}%;
          top: ${top}%;
          width: ${width}%;
          transform: translate(-50%, -50%);
          box-sizing: border-box;
        ">
          ${badgeResolved ? `<img src="${badgeResolved}" style="width: 100%; height: auto;" alt="Badge" />` : ''}
        </div>
      `;
    }

    if (el.type === 'image') {
      const left = el.xPercent != null ? el.xPercent : 50;
      const top = el.yPercent != null ? el.yPercent : 50;
      const width = el.widthPercent || 15;
      const imageResolved = resolveImageUrl(el.imageUrl);
      return `
        <div style="
          position: absolute;
          left: ${left}%;
          top: ${top}%;
          width: ${width}%;
          transform: translate(-50%, -50%);
          box-sizing: border-box;
        ">
          ${imageResolved ? `<img src="${imageResolved}" style="width: 100%; height: auto;" alt="Image" />` : ''}
        </div>
      `;
    }

    let text = el.text || '';
    if (el.type === 'dynamic') {
      if (el.dynamicKey === 'mentee_name') text = data.menteeName || '';
      else if (el.dynamicKey === 'fellowship_name' || el.dynamicKey === 'program_name') text = data.programName || data.fellowshipName || '';
      else if (el.dynamicKey === 'date_issued') text = data.dateIssued || '';
      else if (el.dynamicKey === 'issuer_name') text = data.issuerName || '';
      else if (el.dynamicKey === 'issuer_title') text = data.issuerTitle || '';
    }

    const left = el.xPercent != null ? el.xPercent : 50;
    const top = el.yPercent != null ? el.yPercent : 50;
    const fontSize = el.fontSizePercent ? el.fontSizePercent * 8.48 : 24;
    const color = el.color || '#1e293b';
    const fontWeight = el.fontWeight || 'normal';
    const alignment = el.alignment || 'center';
    const fontFamily = el.fontStyle || 'Montserrat, sans-serif';

    return `
      <div style="
        position: absolute;
        left: ${left}%;
        top: ${top}%;
        width: 90%;
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
        color: ${color};
        font-weight: ${fontWeight};
        text-align: ${alignment};
        transform: translate(-50%, -50%);
        line-height: 1.4;
        box-sizing: border-box;
      ">
        ${text}
      </div>
    `;
  }).join('\n');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cinzel:wght@400;700&family=Great+Vibes&family=Montserrat:wght@400;600;700&family=Oswald:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Sacramento&family=Lustria&family=Merriweather&display=swap');
        html, body {
          margin: 0;
          padding: 0;
          width: 1200px;
          height: 848px;
          overflow: hidden;
          background-color: #ffffff;
        }
        .container {
          position: relative;
          width: 1200px;
          height: 848px;
          box-sizing: border-box;
          background-image: url('${bgImageUrl}');
          background-size: 100% 100%;
          background-position: center;
          background-repeat: no-repeat;
          overflow: hidden;
        }
        .logo {
          position: absolute;
          left: ${logoConfig.xPercent}%;
          top: ${logoConfig.yPercent}%;
          width: ${logoConfig.widthPercent}%;
          height: auto;
          transform: translate(-50%, -50%);
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${logoUrl ? `<img src="${logoUrl}" class="logo" alt="Logo" />` : ''}
        ${elementsHtml}
      </div>
    </body>
    </html>
  `;
}

let _browser = null;
let _browserBooting = false;

async function getBrowserInstance() {
  if (_browser) {
    try {
      await _browser.version();
      return _browser;
    } catch {
      _browser = null;
    }
  }
  if (_browserBooting) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return getBrowserInstance();
  }
  _browserBooting = true;
  try {
    _browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    _browser.on('disconnected', () => { _browser = null; });
    return _browser;
  } finally {
    _browserBooting = false;
  }
}

exports.closeBrowser = async () => {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
};

exports.renderCertificate = async (template, data) => {
  const html = compileHtml(template, data);
  const browser = await getBrowserInstance();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1200, height: 848, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pngBuffer = await page.screenshot({ type: 'png', omitBackground: false });

    const pdfBuffer = await page.pdf({
      width: '11.69in',
      height: '8.27in',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    return { pdfBuffer, pngBuffer };
  } finally {
    await page.close();
  }
};
