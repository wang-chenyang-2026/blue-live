// Read Feishu salary table and build nickname → real name mapping
async function main() {
  const tokenRes = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: "cli_aab083b6c2b99be3", app_secret: "3eg03VsphXSTYxBDyZYA8gLL4JGS8XBI" }),
  });
  const token = (await tokenRes.json()).tenant_access_token;
  const sheetToken = "QmESw57otiab5WkLVqdcblCmnue";

  // Read 兼职 sheet (b88f14) - columns A (姓名) and B (花名)
  const ptUrl = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${sheetToken}/values/b88f14!A1:B50`;
  const ptRes = await fetch(ptUrl, { headers: { Authorization: `Bearer ${token}` } });
  const ptValues = (await ptRes.json()).data?.valueRange?.values || [];

  // Build mapping: 花名 → 真实姓名 (remove trailing non-Chinese chars)
  const mapping = {};
  for (let i = 1; i < ptValues.length; i++) {
    const rawName = String(ptValues[i][0] || "").trim();
    const nickname = String(ptValues[i][1] || "").trim();
    if (rawName && nickname) {
      // Remove trailing non-Chinese characters (digits, letters, etc.)
      const cleanName = rawName.replace(/[^\u4e00-\u9fa5]+$/, "");
      mapping[nickname] = cleanName;
    }
  }

  // Read 全职 sheet (CxB4xa) - columns A (所属项目) and B (姓名)
  const ftUrl = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${sheetToken}/values/CxB4xa!A1:B50`;
  const ftRes = await fetch(ftUrl, { headers: { Authorization: `Bearer ${token}` } });
  const ftValues = (await ftRes.json()).data?.valueRange?.values || [];

  // Full-time names
  const ftNames = [];
  for (let i = 1; i < ftValues.length; i++) {
    const project = String(ftValues[i][0] || "").trim();
    const name = String(ftValues[i][1] || "").trim();
    if (name && project) {
      ftNames.push(name);
    }
  }

  console.log("=== 兼职: 花名→真实姓名 映射表 ===");
  console.log(JSON.stringify(mapping, null, 2));

  console.log("\n=== 全职: 姓名列表 ===");
  console.log(JSON.stringify(ftNames, null, 2));

  console.log("\n=== 统计 ===");
  console.log("兼职映射数:", Object.keys(mapping).length);
  console.log("全职人数:", ftNames.length);
}

main().catch(console.error);
