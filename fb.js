#!/usr/bin/env node

const fs = require('fs');
const puppeteer = require('puppeteer');
const devices = require('puppeteer/DeviceDescriptors');
const argv = require('minimist')(process.argv.slice(2));
const authenticator = require('authenticator');
const Jimp = require("jimp");

const MY_DEVICE = devices['iPhone 6'];

function error(arg) {
    console.log(`Error: ${arg} is required`);
    process.exit(1);
}

// args
const url = argv.url || error('url');
const format = argv.format === 'jpeg' ? 'jpeg' : 'png';
const quality = argv.quality || 100;
const stitch = argv.stitch ? true : false;
const maxHeight = stitch ? 16384 : (argv.maxHeight || 16384);
const outputDir = argv.outputDir || './';
const outputName = argv.outputName || 'screenshot';
const anonymous = argv.anonymous ? true : false;

const user = argv.fbuser || process.env.FB_USER || error('user');
const password = argv.fbpassword || process.env.FB_PASSWORD || error('password');
const twofakey = argv.fb2fakey || process.env.FB_2FA_KEY;

(async() => {

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.emulate(MY_DEVICE);

    if (fs.existsSync('./cookies')) {
        console.log('Import saved cookies');

        const cookies = JSON.parse(fs.readFileSync('./cookies', 'utf-8'));
        await page.setCookie(...cookies);
    }

    // home page
    await page.goto('https://m.facebook.com/', {
        waitUntil: 'networkidle'
    });

    // login detected
    if (await page.$('input[name=email]') !== null) {
        console.log('Login form detected. Logging in...');

        await page.click('input[name=email]');
        await page.type(user);
        await page.click('input[name=pass]');
        await page.type(password);
        await page.click('button[name=login]');
        await page.waitForNavigation({
            waitUntil: 'load'
        });

        if (await page.$('input[name=email]') !== null) { // login failed
            return Promise.reject('Error: login failed');
        }

        // 2FA check
        const input2FA = await page.$('input#approvals_code');
        if (input2FA !== null) {
            console.log('2FA form detected. Generating TOTP...');

            if (!twofakey) {
                return Promise.reject('Error: 2FA code is required');
            }

            await input2FA.click();
            await page.type(authenticator.generateToken(twofakey));
            await page.click('button[type=submit]');
            await page.waitForNavigation({
                waitUntil: 'load'
            });

            if (await page.$('input#approvals_code') !== null) { // 2FA failed
                return Promise.reject('Error: 2FA failed');
            }

            await page.click('input[type=radio][value="dont_save"]');
            await page.click('button[type=submit]');
            await page.waitForNavigation({
                waitUntil: 'load'
            });

            // review login
            const checkpointBtn = await page.$('button#checkpointSubmitButton-actual-button');
            if (checkpointBtn !== null) {
                await checkpointBtn.click();
                await page.waitForNavigation({
                    waitUntil: 'load'
                });
                await page.click('button#checkpointSubmitButton-actual-button');
                await page.waitForNavigation({
                    waitUntil: 'load'
                });

                await page.click('input[type=radio][value="dont_save"]');
                await page.click('button[type=submit]');
                await page.waitForNavigation({
                    waitUntil: 'load'
                });
            }
        }
    }

    // if somehow the newsfeed is not shown...
    if (await page.$('#MComposer') === null) {
        return Promise.reject('Newsfeed not found!');
    }

    console.log('Write cookies to file...');
    fs.writeFileSync('./cookies', JSON.stringify(await page.cookies()), 'utf-8');

    // navigate to url
    console.log(`Navigate to ${url}`);
    await page.goto(url, {
        waitUntil: 'networkidle'
    });

    if (await page.$('#m_story_permalink_view') === null) {
        return Promise.reject('It should be the permalink of a post');
    }

    // expand all comments and their replies
    console.log('Expand all comments and their replies');

    for (let selector of ['div[id^=see_] a', '._rzh div[id^=comment_replies_more] a']) {
        let link;
        while ((link = await page.$(selector)) !== null) {
            const heightBefore = await page.evaluate(() => document.body.clientHeight);

            await link.click();
            await page.waitForNavigation({
                waitUntil: 'networkidle'
            });

            const heightAfter = await page.evaluate(() => document.body.clientHeight);

            // walkaround for the infinite loop caused by an infinite pagination of facebook
            if (heightAfter === heightBefore) {
                link.evaluate(() => this.remove());
            }
        }
    }

    console.log('Execute in-page scripts');
    await page.evaluate((isAnonymous) => {
        // remove all comment/reply forms
        document.querySelectorAll('div[data-sigil*="m-noninline-composer"], div[data-sigil*="m-inline-reply-composer"]').forEach(el => el.remove());
        // remove the user selector button which can reveal author identity
        document.querySelectorAll('div[id^=actor_selector]').forEach(el => el.remove());

        // hide all involved users identity
        if (isAnonymous) {
            document.querySelectorAll('.story_body_container header h3 a, a._52jh._1s79').forEach(el => el.innerText = el.innerText.split(' ').map(str => str.length > 0 ? str[0] : '').join(' '));
            document.querySelectorAll('i.img._4prr.profpic').forEach(el => el.style['filter'] = 'blur(3px)');
        }
        return Promise.resolve();
    }, anonymous);

    /**
     * Bypass the 16384px limit by taking multiple screenshots of height 16384px then stich them together
     * https://groups.google.com/a/chromium.org/forum/#!topic/headless-dev/DqaAEXyzvR0
     */

    // calculate page size
    const [width, height, startY] = await page.evaluate(() => {
        const root = document.querySelector('#root');
        return Promise.resolve([document.body.clientWidth, document.body.clientHeight, root.offsetTop]);
    });

    const limit = Math.floor(maxHeight / MY_DEVICE.viewport.deviceScaleFactor);
    const nbParts = Math.floor(height / limit) + 1;

    let outputFile;
    if (stitch)
        outputFile = new Jimp(width * MY_DEVICE.viewport.deviceScaleFactor, (height - startY) * MY_DEVICE.viewport.deviceScaleFactor);

    for (let i = 0; i < nbParts; i++) {
        console.log(`Take screenshot part ${i}`);

        const y = startY + i * limit;
        const buffer = await page.screenshot({
            type: format,
            clip: {
                x: 0,
                y: y,
                width: width,
                height: Math.min(limit, height - y)
            }
        });
        const part = await Jimp.read(buffer);

        if (stitch)
            outputFile.blit(part, 0, i * maxHeight);
        else
            part
            .quality(quality)
            .write(`${outputDir + outputName}.part${i}.${format}`);
    }

    if (stitch)
        outputFile
        .quality(quality)
        .write(`${outputDir + outputName}.${format}`);

    browser.close();
})().catch(error => {
    console.log(error);
    process.exit(1);
});