import axios, { AxiosProxyConfig } from "axios";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export default class PASS {
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';

    private ip = "";
    private JSESSIONID = "";
    private SCOUTER = "";
    private wcToken = "";
    private menuId = "";
    proxy?: AxiosProxyConfig;

    private status: "waitforinit" | "initialized" | "qr" | "captcha_pass" | "captcha_sms" | "waiting_pass" | "sms" | "completed" = "waitforinit";

    constructor(proxy?: AxiosProxyConfig, userAgent?: string) {
        this.proxy = proxy;
        if (userAgent) this.userAgent = userAgent;
    }

    async init() {
        if (this.status !== "waitforinit") throw new Error("Already initialized");

        const { data: initData } = await axios("https://www.ex.co.kr:8070/recruit/company/nice/checkplus_main_company.jsp");
    
        const { data: calltracer, headers: initheaders } = await axios({
            method: "post",
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/checkplus.cb",
            data: {
                m: "checkplusService",
                EncodeData: initData.match(/EncodeData" value="(.*)"/)[1],
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            proxy: this.proxy
        });
    
        this.JSESSIONID = initheaders["set-cookie"]?.filter((cookie: string) => cookie.startsWith("JSESSIONID=")).pop()?.split(";").shift()?.split("=").pop()!;
        this.SCOUTER = initheaders["set-cookie"]?.filter((cookie: string) => cookie.startsWith("SCOUTER=")).pop()?.split(";").shift()?.split("=").pop()!;
    
        const [_, ip, token] = calltracer.match(/'([^']+)', '([a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12})'/);
    
        this.wcToken = `${token}_T_${Math.floor(Math.random() * 89999 + 10000)}_WC`;
        this.ip = ip;

        await axios({
            url: "https://ifc.niceid.co.kr/TRACERAPI/inputQueue.do",
            method: "post",
            data: {
                host: "COMMON_CHECKPLUS",
                ip,
                loginId: this.wcToken,
                port: 80,
                pageUrl: 'service',
                userAgent: this.userAgent.toLowerCase()
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent
            },
            proxy: this.proxy
        });
    
        const { data: main } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "post",
            data: {
                m: "serviceMain"
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent,
                Cookie: `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            },
            proxy: this.proxy
        });
    
        if (main.includes("IP") && !main.includes("callTracerApi")) throw new Error("IP Blocked");
    
        this.menuId = main.match(/var menuId = "([a-f\d]+)";/)[1];
        
        await axios({
            url: "https://ifc.niceid.co.kr/TRACERAPI/inputQueue.do",
            method: "post",
            data: {
                host: "COMMON_MOBILE",
                ip,
                loginId: this.wcToken,
                port: 80,
                pageUrl: 'safeIdentVerify_mobile',
                userAgent: this.userAgent.toLowerCase()
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent
            },
            proxy: this.proxy
        });

        this.status = "initialized";
    }

    async beginPASSVerification(telecom: "SKT" | "SKM" | "KTF" | "KTM" | "LGT" | "LGM"): Promise<Buffer> {
        if (this.status !== "initialized") throw new Error("Not initialized");

        await axios({
            url: "https://ifc.niceid.co.kr/TRACERAPI/inputQueue.do",
            method: "post",
            data: {
                host: `COMMON_MOBILE_${["SKT", "SKM"].includes(telecom) ? "SKT" : (["KTF", "KTM"].includes(telecom) ? "KT" : "LGU")}`,
                ip: this.ip,
                loginId: this.wcToken,
                port: 80,
                pageUrl: telecom,
                userAgent: this.userAgent.toLowerCase()
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent
            }
        });

        const { data: verifypage } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "post",
            data: ["SKT", "KTF", "LGT"].includes(telecom) ? {
                m: "authMobile01",
                mobileco: telecom,
                mobileAuthType: "SIMPLE",
                nciInfo: "",
                menuId: this.menuId,
                agree: "on",
                agree1: "Y",
                agree2: "Y",
                agree3: "Y",
                agree4: "Y"
            } : {
                m: "authMobile01",
                mobileco: telecom,
                mobileAuthType: "SIMPLE",
                nciInfo: "",
                menuId: this.menuId,
                agree: "on",
                agree1: "Y",
                agree2: "Y",
                agree3: "Y",
                agree4: "Y",
                agree6: "Y",
                mvnoCo: "SKM"
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent,
                Cookie: `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });

        this.menuId = verifypage.match(/var menuId = "([a-f\d]+)";/)[1];

        const { data: image } = await axios({
            url: 'https://nice.checkplus.co.kr/Common/service.cb',
            method: "get",
            responseType: "arraybuffer",
            params: {
                m: "simpleCaptchaInfo",
                ver: `MOBILE${Date.now()}`
            },
            headers: {
                "Cookie": `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });

        this.status = "captcha_pass";

        return image;
    }

    async sendPASSNotification(name: string, phone: string, answer: string) {
        if (this.status !== "captcha_pass") throw new Error("Not waiting for captcha (pass)");

        const { data: authRequest } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "POST",
            headers: {
                "accept": "*/*",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest",
                "Referer": "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "Cookie": `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            },
            data: {
                m: "authMobile01Proc",
                authType: "SIMPLE",
                menuId: this.menuId,
                username: name,
                mobileno: phone,
                answer
            }
        });

        if (authRequest.RES_CD !== '0000') {
            throw new Error(decodeURIComponent(authRequest.RES_RESULT).replace(/\+/g, " "));
        }
        
        const { data: submitpage } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "POST",
            data: {
                m: "authMobile02",
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent,
                Cookie: `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });
    
        this.menuId = submitpage.match(/var menuId = "([a-f\d]+)";/)[1];
        
        this.status = "waiting_pass";
    }

    async checkPASSCompleted() {
        const { data: checkresult } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "POST",
            data: {
                m: "authMobile02Proc",
                menuId: this.menuId
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent,
                Cookie: `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });
        
        this.menuId = checkresult.RES_MENU_ID;

        if (checkresult.RES_CD !== '0000') {
            throw new Error(decodeURIComponent(checkresult.RES_RESULT).replace(/\+/g, " "));
        }

        this.status = "completed";
    }

    async beginSMSVerification(telecom: "SKT" | "SKM" | "KTF" | "KTM" | "LGT" | "LGM"): Promise<Buffer> {
        if (this.status !== "initialized") throw new Error("Not initialized");

        await axios({
            url: "https://ifc.niceid.co.kr/TRACERAPI/inputQueue.do",
            method: "post",
            data: {
                host: `COMMON_MOBILE_${["SKT", "SKM"].includes(telecom) ? "SKT" : (["KTF", "KTM"].includes(telecom) ? "KT" : "LGU")}`,
                ip: this.ip,
                loginId: this.wcToken,
                port: 80,
                pageUrl: telecom,
                userAgent: this.userAgent.toLowerCase()
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent
            }
        });

        const { data: verifypage } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "post",
            data: ["SKT", "KTF", "LGT"].includes(telecom) ? {
                m: "authMobile01",
                mobileco: telecom,
                mobileAuthType: "SMS",
                nciInfo: "",
                menuId: this.menuId,
                agree: "on",
                agree1: "Y",
                agree2: "Y",
                agree3: "Y",
                agree4: "Y"
            } : {
                m: "authMobile01",
                mobileco: telecom,
                mobileAuthType: "SMS",
                nciInfo: "",
                menuId: this.menuId,
                agree: "on",
                agree1: "Y",
                agree2: "Y",
                agree3: "Y",
                agree4: "Y",
                agree6: "Y",
                mvnoCo: "SKM"
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent,
                Cookie: `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });

        this.menuId = verifypage.match(/var menuId = "([a-f\d]+)";/)[1];

        const { data: image } = await axios({
            url: 'https://nice.checkplus.co.kr/Common/service.cb',
            method: "get",
            responseType: "arraybuffer",
            params: {
                m: "simpleCaptchaInfo",
                ver: `MOBILE${Date.now()}`
            },
            headers: {
                "Cookie": `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });

        this.status = "captcha_sms";

        return image;
    }

    async sendSMS(name: string, first_ssn: string, last_ssn: string, phone: string, answer: string) {
        if (this.status !== "captcha_sms") throw new Error("Not waiting for captcha answer (sms)");

        const { data: authRequest } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "POST",
            headers: {
                "accept": "*/*",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest",
                "Referer": "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "Cookie": `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            },
            data: {
                m: "authMobile01Proc",
                authType: "SMS",
                menuId: this.menuId,
                username: name,
                mynum1: first_ssn,
                mynum2: last_ssn,
                mobileno: phone,
                answer
            }
        });

        if (authRequest.RES_CD !== '0000') {
            throw new Error(decodeURIComponent(authRequest.RES_RESULT).replace(/\+/g, " "));
        }
        
        this.status = "sms";

        const { data: submitpage } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "POST",
            data: {
                m: "authMobile02",
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent,
                Cookie: `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });
    
        this.menuId = submitpage.match(/var menuId = "([a-f\d]+)";/)[1];
        
        return;
    }

    async verifySMS(answer: string): Promise<void> {
        if (this.status !== "sms") throw new Error("Not waiting for sms answer");

        const { data: authResult } = await axios({
            url: "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
            method: "POST",
            data: {
                m: "authMobile02Proc",
                menuId: this.menuId,
                authnumber: answer
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": this.userAgent,
                Cookie: `wcCookie=${this.wcToken}; JSESSIONID=${this.JSESSIONID}; SCOUTER=${this.SCOUTER}`
            }
        });

        if (authResult.RES_CD !== '0000') {
            throw new Error(decodeURIComponent(authResult.RES_RESULT).replace(/\+/g, " "));
        }
        
        this.status = "completed";

        return;
    }
};