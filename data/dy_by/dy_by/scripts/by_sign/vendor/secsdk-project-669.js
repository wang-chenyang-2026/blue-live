/*!
* @byted/secsdk-strategy v1.0.1
* (c) 2024
*/
!function(e){"function"==typeof define&&define.amd?define(e):e()}((function(){"use strict";window.registToGlobal("executeFetchRequest",(function(e,t,n){var o=e.payload,i=window.use("ActionType"),s=t.type;if("csrfWebToken"===t.strategyKey&&s===i.REWRITE&&o.addHeader("x-secsdk-csrf-token","DOWNGRADE"),n)return o.originFn.apply(o.context,o.args)})),window.registToGlobal("executeXHRRequestSend",(function(e,t,n){var o=e.payload,i=window.use("ActionType"),s=t.type;if("csrfWebToken"===t.strategyKey&&s===i.REWRITE&&o.context.setRequestHeader("x-secsdk-csrf-token","DOWNGRADE"),n)return o.originFn.apply(o.context,o.args)}))}));
//# sourceMappingURL=project_669.js.map
