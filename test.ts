import readline from "readline/promises";
import PASS from ".";
import fs from "fs";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// PASS 인증
(async () => {
    const session = new PASS();

    await session.init();

    const captchaImg = await session.beginPASSVerification("SKT");

    fs.writeFileSync("captcha.png", captchaImg);

    const captcha = await rl.question("사진에 보이는 숫자를 입력해주세요: ");

    await session.sendPASSNotification("이름", "010~~~~~~~~", captcha);

    await rl.question("인증후엔터");

    const verified = await session.checkPASSCompleted().then(() => true).catch(() => false);

    console.log(`인증 ${verified ? '성공' : '실패'}`);
})();

// 문자 인증
(async () => {
    const session = new PASS();

    await session.init();

    const captchaImg = await session.beginSMSVerification("SKT");

    fs.writeFileSync("captcha.png", captchaImg);

    const captcha = await rl.question("사진에 보이는 숫자를 입력해주세요: ");

    await session.sendSMS("이름", "주민등록번호 앞 6자리", "주민등록번호 뒷 1자리", "010~~~~~~~~", captcha);

    const code = await rl.question("인증번호 : ");

    const verified = await session.verifySMS(code).then(() => true).catch(() => false);

    console.log(`인증 ${verified ? '성공' : '실패'}`);
})();