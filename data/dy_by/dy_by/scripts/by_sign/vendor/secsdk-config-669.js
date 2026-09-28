/*!
* @byted/secsdk-strategy v1.0.1
* (c) 2024
*/
!function(e){"function"==typeof define&&define.amd?define(e):e()}((function(){"use strict";window.registToModule("globalConfig",{strategy:{hitGray:{body:{version:"1.0.0",key:"hitGray",name:"灰度切流策略",expression:function(e){for(var o=window.use("globalConfig").strategy.hitGray.config,n=window.use("ActionType"),t=o.selectors,i=o.sampleRatio,a=[],r=0,s=t;r<s.length;r++){for(var l=s[r],p=l.path,f=l.value,u=l.op,d=window,h=p.split("."),g=0,c=0,v=h;c<v.length;c++){var w=v[c];d&&(g++,d=d[w])}window!==d&&g===h.length&&("==="===u?a.push(d===f):"!=="===u&&a.push(d!==f))}return 1e4*Math.floor(Math.random())<i&&a.push(!0),{type:a.length>0&&a.some((function(e){return e}))?n.REWRITE:n.PASS}}},config:{selectors:[{path:"gfdatav1.envName",value:"prod",op:"!=="},{path:"SSR_RENDER_DATA.envService",value:"prod",op:"!=="}],sampleRatio:0}}}})}));
//# sourceMappingURL=config_669.js.map
