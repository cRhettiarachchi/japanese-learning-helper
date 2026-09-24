const test=require('node:test'),assert=require('node:assert/strict');
const {verifyIdentity,authorizeWrite}=require('../server/auth.cjs');
const h=require('../server/http.cjs');
test('signed Vercel identity requires correct issuer, audience, nonce, expiry and signature',async()=>{
 const {generateKeyPair,SignJWT}=await import('jose');const {privateKey,publicKey}=await generateKeyPair('RS256');const other=await generateKeyPair('RS256');
 const sign=(claims={},key=privateKey)=>new SignJWT({sub:'user-a',name:'A',nonce:'nonce-a',...claims}).setProtectedHeader({alg:'RS256'}).setIssuer(claims.iss||'https://vercel.com').setAudience(claims.aud||'client-a').setIssuedAt().setExpirationTime(claims.exp||'5m').sign(key);
 const verify=token=>verifyIdentity(token,'nonce-a',{key:publicKey,clientId:'client-a'});
 assert.equal((await verify(await sign())).userId,'https://vercel.com|user-a');
 for(const claims of [{iss:'https://attacker.example'},{aud:'other'},{nonce:'wrong'},{exp:1},{azp:'other'},{sub:''}])await assert.rejects(verify(await sign(claims)));
 await assert.rejects(verify(await sign({},other.privateKey)));
});
test('write requests require exact origin and session CSRF, including non-ASCII attacks',()=>{
 process.env.APP_ORIGIN='http://127.0.0.1:8765';const s={csrf:'aa'};
 assert.doesNotThrow(()=>authorizeWrite({headers:{origin:process.env.APP_ORIGIN,'x-csrf-token':'aa'}},s));
 for(const headers of [{origin:'https://evil.example','x-csrf-token':'aa'},{origin:process.env.APP_ORIGIN},{origin:process.env.APP_ORIGIN,'x-csrf-token':'éé'}])assert.throws(()=>authorizeWrite({headers},s),{status:403});
 assert.equal(h.equal('é','a'),false);
});
test('cookies are HttpOnly, same-site and secure in production; OAuth cookie can be cleared separately',()=>{
 process.env.APP_ORIGIN='https://hirogaru-study.vercel.app';const headers={};const res={setHeader:(k,v)=>headers[k]=v,getHeader:k=>headers[k]};
 h.setCookie(res,'session','opaque',86400);h.setCookie(res,'oauth','',0);
 assert.equal(headers['Set-Cookie'].length,2);assert.match(headers['Set-Cookie'][0],/^__Host-learner_session=opaque; Path=\/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure$/);
});
