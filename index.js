#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SECPANEL_URL = (process.env.SECPANEL_URL || 'https://secpanel.hosteva.net').replace(/\/+$/, '');
const SECPANEL_API_KEY = process.env.SECPANEL_API_KEY || '';

async function callSecpanelApi(endpoint, method = 'GET', body = null) {
  if (!SECPANEL_API_KEY) {
    throw new Error('SECPANEL_API_KEY ortam değişkeni tanımlanmamış. API anahtarı almak için lütfen https://www.hosteva.com adresinden kaydolup anahtarınızı oluşturun.');
  }

  const url = `${SECPANEL_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${SECPANEL_API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Hosteva-SecPanel-MCP/1.1'
  };

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    if (response.status === 504 || response.status === 502) {
      throw new Error(`SecPanel API ağ geçidi zaman aşımına uğradı (${response.status}). Sunucu yoğun olabilir veya taranan paket sayısı çok fazladır.`);
    }
    throw new Error(`SecPanel API geçersiz yanıt döndü (${response.status}): ${text.substring(0, 150)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || `SecPanel API Hatası (${response.status}): ${data.message || text}`);
  }

  return data;
}

function cleanVersion(v) {
  if (!v || typeof v !== 'string') return '*';
  return v.replace(/^[v^~>=<]+/, '').trim();
}

function parseNpmLock(lockContent, pkgJsonContent = null, includeTransitive = false) {
  const packages = [];
  const directDeps = new Set();

  if (pkgJsonContent) {
    try {
      const pkg = typeof pkgJsonContent === 'string' ? JSON.parse(pkgJsonContent) : pkgJsonContent;
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      Object.keys(allDeps).forEach(name => directDeps.add(name));
    } catch (_) {}
  }

  try {
    const lock = typeof lockContent === 'string' ? JSON.parse(lockContent) : lockContent;

    if (lock.packages && typeof lock.packages === 'object') {
      const rootPkg = lock.packages[''];
      if (rootPkg && directDeps.size === 0) {
        const rootDeps = { ...(rootPkg.dependencies || {}), ...(rootPkg.devDependencies || {}) };
        Object.keys(rootDeps).forEach(name => directDeps.add(name));
      }

      for (const [key, pkgData] of Object.entries(lock.packages)) {
        if (!key || key === '') continue;
        if (!key.startsWith('node_modules/')) continue;

        const subPath = key.replace(/^node_modules\//, '');
        const isNested = subPath.includes('/node_modules/');
        const pkgName = isNested ? subPath.split('/node_modules/').pop() : subPath;

        if (!includeTransitive && directDeps.size > 0 && !directDeps.has(pkgName)) {
          continue;
        }

        if (pkgData && pkgData.version) {
          packages.push({
            name: pkgName,
            version: cleanVersion(pkgData.version),
            ecosystem: 'npm'
          });
        }
      }
    } else if (lock.dependencies && typeof lock.dependencies === 'object') {
      for (const [name, depData] of Object.entries(lock.dependencies)) {
        if (!includeTransitive && directDeps.size > 0 && !directDeps.has(name)) {
          continue;
        }
        if (depData && depData.version) {
          packages.push({
            name,
            version: cleanVersion(depData.version),
            ecosystem: 'npm'
          });
        }
      }
    }
  } catch (_) {}

  return packages;
}

function parseComposerLock(lockContent, composerJsonContent = null, includeTransitive = false) {
  const packages = [];
  const directDeps = new Set();

  if (composerJsonContent) {
    try {
      const comp = typeof composerJsonContent === 'string' ? JSON.parse(composerJsonContent) : composerJsonContent;
      const allDeps = { ...(comp.require || {}), ...(comp['require-dev'] || {}) };
      Object.keys(allDeps).forEach(name => {
        if (name !== 'php' && !name.startsWith('ext-')) directDeps.add(name);
      });
    } catch (_) {}
  }

  try {
    const lock = typeof lockContent === 'string' ? JSON.parse(lockContent) : lockContent;
    const allPkgs = [...(lock.packages || []), ...(lock['packages-dev'] || [])];

    for (const item of allPkgs) {
      if (!item.name || !item.version) continue;
      if (item.name === 'php' || item.name.startsWith('ext-')) continue;

      if (!includeTransitive && directDeps.size > 0 && !directDeps.has(item.name)) {
        continue;
      }

      packages.push({
        name: item.name,
        version: cleanVersion(item.version),
        ecosystem: 'composer'
      });
    }
  } catch (_) {}

  return packages;
}

function parseYarnLock(yarnContent, pkgJsonContent = null) {
  const packages = [];
  const directDeps = new Set();

  if (pkgJsonContent) {
    try {
      const pkg = typeof pkgJsonContent === 'string' ? JSON.parse(pkgJsonContent) : pkgJsonContent;
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      Object.keys(allDeps).forEach(name => directDeps.add(name));
    } catch (_) {}
  }

  const seen = new Set();
  const regex = /^"?((?:@[^@\s\r\n]+\/)?[^@\s\r\n]+)@[^:\r\n]+:\r?\n\s+version:?\s+"?([^"\r\n]+)"?/gm;
  let match;
  while ((match = regex.exec(yarnContent)) !== null) {
    const name = match[1];
    const version = cleanVersion(match[2]);
    if (directDeps.size > 0 && !directDeps.has(name)) continue;
    if (!seen.has(name)) {
      seen.add(name);
      packages.push({ name, version, ecosystem: 'npm' });
    }
  }

  return packages;
}

function parsePnpmLock(pnpmContent, pkgJsonContent = null) {
  const packages = [];
  const directDeps = new Set();

  if (pkgJsonContent) {
    try {
      const pkg = typeof pkgJsonContent === 'string' ? JSON.parse(pkgJsonContent) : pkgJsonContent;
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      Object.keys(allDeps).forEach(name => directDeps.add(name));
    } catch (_) {}
  }

  const seen = new Set();
  const regex = /['"]?\/((?:@[^@\s\r\n\/]+\/)?[^@\s\r\n\/]+)@([0-9\.\-a-zA-Z]+)['"]?:/g;
  let match;
  while ((match = regex.exec(pnpmContent)) !== null) {
    const name = match[1];
    const version = cleanVersion(match[2]);
    if (directDeps.size > 0 && !directDeps.has(name)) continue;
    if (!seen.has(name)) {
      seen.add(name);
      packages.push({ name, version, ecosystem: 'npm' });
    }
  }

  return packages;
}

function parsePoetryLock(content) {
  const packages = [];
  const regex = /\[\[package\]\][\s\S]*?name\s*=\s*"([^"]+)"[\s\S]*?version\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    packages.push({
      name: match[1],
      version: cleanVersion(match[2]),
      ecosystem: 'pypi'
    });
  }
  return packages;
}

function parsePipfileLock(content) {
  const packages = [];
  try {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    const all = { ...(data.default || {}), ...(data.develop || {}) };
    for (const [name, obj] of Object.entries(all)) {
      const ver = obj && obj.version ? cleanVersion(obj.version) : '*';
      packages.push({ name, version: ver, ecosystem: 'pypi' });
    }
  } catch (_) {}
  return packages;
}

const ALLOWED_LOCK_FILES = [
  'package-lock.json',
  'package.json',
  'composer.lock',
  'composer.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'pipfile.lock',
  'pipfile',
  'poetry.lock',
  'pyproject.toml'
];

function isAllowedLockFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const base = path.basename(filePath).toLowerCase();
  if (ALLOWED_LOCK_FILES.includes(base)) return true;
  if (/^requirements([a-zA-Z0-9_\-]*)\.txt$/.test(base)) return true;
  return false;
}

function parseRequirementsTxt(content) {
  const packages = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.includes(':')) continue;
    if (trimmed.includes('=') && !/(?:==|>=|<=|~=|!=)/.test(trimmed)) continue;
    const match = trimmed.match(/^([a-zA-Z0-9][a-zA-Z0-9_\-\.]*)\s*(?:(==|>=|<=|~=|!=|<|>)\s*([0-9a-zA-Z_\.\-]+))?$/);
    if (match) {
      packages.push({ name: match[1], version: match[3] || '*', ecosystem: 'pypi' });
    }
  }
  return packages;
}

function parseRawContent(rawContent, fileType = '') {
  if (!rawContent || typeof rawContent !== 'string') return [];
  const type = (fileType || '').toLowerCase();

  if (type.includes('package-lock') || rawContent.includes('"lockfileVersion"')) {
    return parseNpmLock(rawContent, null, false);
  }
  if (type.includes('composer.lock') || (rawContent.includes('"packages"') && rawContent.includes('"packages-dev"'))) {
    return parseComposerLock(rawContent, null, false);
  }
  if (type.includes('pipfile.lock') || (rawContent.includes('"_meta"') && rawContent.includes('"default"'))) {
    return parsePipfileLock(rawContent);
  }
  if (type.includes('poetry.lock') || rawContent.includes('[[package]]')) {
    return parsePoetryLock(rawContent);
  }
  if (type.includes('yarn.lock') || rawContent.includes('yarn lockfile v1')) {
    return parseYarnLock(rawContent);
  }
  if (type.includes('requirements') || type.endsWith('.txt')) {
    return parseRequirementsTxt(rawContent);
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p && p.name).map(p => ({
        name: String(p.name).trim(),
        version: cleanVersion(p.version || '*'),
        ecosystem: p.ecosystem || 'npm'
      }));
    }
    if (parsed.dependencies || parsed.devDependencies) {
      const all = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
      return Object.entries(all).map(([name, ver]) => ({
        name,
        version: cleanVersion(ver),
        ecosystem: 'npm'
      }));
    }
  } catch (_) {}

  return [];
}

function parseDependenciesFromDir(projectDir = process.cwd(), options = {}) {
  const packages = [];
  const includeTransitive = Boolean(options.includeTransitive);

  const pkgJsonPath = path.join(projectDir, 'package.json');
  const pkgLockPath = path.join(projectDir, 'package-lock.json');
  const yarnLockPath = path.join(projectDir, 'yarn.lock');
  const pnpmLockPath = path.join(projectDir, 'pnpm-lock.yaml');
  const pkgJsonContent = fs.existsSync(pkgJsonPath) ? fs.readFileSync(pkgJsonPath, 'utf8') : null;

  if (fs.existsSync(pkgLockPath)) {
    const lockContent = fs.readFileSync(pkgLockPath, 'utf8');
    packages.push(...parseNpmLock(lockContent, pkgJsonContent, includeTransitive));
  } else if (fs.existsSync(yarnLockPath)) {
    const yarnContent = fs.readFileSync(yarnLockPath, 'utf8');
    packages.push(...parseYarnLock(yarnContent, pkgJsonContent));
  } else if (fs.existsSync(pnpmLockPath)) {
    const pnpmContent = fs.readFileSync(pnpmLockPath, 'utf8');
    packages.push(...parsePnpmLock(pnpmContent, pkgJsonContent));
  } else if (pkgJsonContent) {
    try {
      const pkg = JSON.parse(pkgJsonContent);
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const [name, rawVer] of Object.entries(allDeps)) {
        packages.push({ name, version: cleanVersion(rawVer), ecosystem: 'npm' });
      }
    } catch (_) {}
  }

  const composerJsonPath = path.join(projectDir, 'composer.json');
  const composerLockPath = path.join(projectDir, 'composer.lock');
  const compJsonContent = fs.existsSync(composerJsonPath) ? fs.readFileSync(composerJsonPath, 'utf8') : null;

  if (fs.existsSync(composerLockPath)) {
    const lockContent = fs.readFileSync(composerLockPath, 'utf8');
    packages.push(...parseComposerLock(lockContent, compJsonContent, includeTransitive));
  } else if (compJsonContent) {
    try {
      const comp = JSON.parse(compJsonContent);
      const allDeps = { ...(comp.require || {}), ...(comp['require-dev'] || {}) };
      for (const [name, rawVer] of Object.entries(allDeps)) {
        if (name === 'php' || name.startsWith('ext-')) continue;
        packages.push({ name, version: cleanVersion(rawVer), ecosystem: 'composer' });
      }
    } catch (_) {}
  }

  const poetryLockPath = path.join(projectDir, 'poetry.lock');
  const pipfileLockPath = path.join(projectDir, 'Pipfile.lock');
  const reqTxtPath = path.join(projectDir, 'requirements.txt');

  if (fs.existsSync(poetryLockPath)) {
    packages.push(...parsePoetryLock(fs.readFileSync(poetryLockPath, 'utf8')));
  } else if (fs.existsSync(pipfileLockPath)) {
    packages.push(...parsePipfileLock(fs.readFileSync(pipfileLockPath, 'utf8')));
  } else if (fs.existsSync(reqTxtPath)) {
    packages.push(...parseRequirementsTxt(fs.readFileSync(reqTxtPath, 'utf8')));
  }

  return packages;
}

const TOOLS = [
  {
    name: 'scan_dependencies',
    description: 'Projedeki bağımlılıkları (package-lock.json, composer.lock, yarn.lock, pnpm-lock.yaml, Pipfile.lock, poetry.lock veya manifestler) otomatik tarar ya da AI modelinin doğrudan ilettiği harici paket listesini/kilit metnini tarayarak Hosteva SecPanel üzerinden CVE, risk skoru, EPSS ve Türkçe AI çözüm rehberi çıkarır. Canlı kota ve kalan limit durumunu bildirir.',
    inputSchema: {
      type: 'object',
      properties: {
        project_dir: {
          type: 'string',
          description: 'Taranacak proje kök dizini (Boş bırakılırsa çalışma dizini kullanılır).'
        },
        packages: {
          type: 'array',
          description: 'Doğrudan taranacak harici kütüphane listesi. Modelin hafızasında veya harici ortamda (docker, pip freeze, dpkg vb.) tutulan sürümler doğrudan iletilebilir. Örn: [{"name": "axios", "version": "1.19.0", "ecosystem": "npm"}]',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Paket adı' },
              version: { type: 'string', description: 'Paket sürümü' },
              ecosystem: { type: 'string', description: 'Ekosistem (npm, composer, pypi vb.)' }
            },
            required: ['name', 'version']
          }
        },
        raw_content: {
          type: 'string',
          description: 'Harici bir ortamdan (SSH, container, clipboard vb.) alınan ham lock veya manifest içeriği (package-lock.json, composer.lock, requirements.txt vb.).'
        },
        file_type: {
          type: 'string',
          description: 'raw_content formatı ("package-lock.json", "composer.lock", "requirements.txt", "yarn.lock" vb.).'
        },
        lock_file_path: {
          type: 'string',
          description: 'Doğrudan okunacak özel bir kilit veya bağımlılık dosyasının tam dosya yolu.'
        },
        project_name: {
          type: 'string',
          description: 'Güvenlik raporu için özel proje başlığı (İsteğe bağlı).'
        },
        include_transitive: {
          type: 'boolean',
          description: 'Lock dosyasındaki dolaylı/alt bağımlılıkları da analize dahil et (Varsayılan: false).'
        }
      }
    }
  },
  {
    name: 'check_package',
    description: 'Tek bir kütüphane için anlık zafiyet ve CVE sorgusu yapar, kalan kullanım kotasını döner.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Kütüphane veya paket adı (Örn: axios, lodash, guzzlehttp/guzzle)' },
        version: { type: 'string', description: 'Paket sürümü (Örn: 0.21.1, 4.17.15)' },
        ecosystem: { type: 'string', description: 'Ekosistem (npm, composer, pypi vb.)' }
      },
      required: ['name', 'version']
    }
  },
  {
    name: 'get_cve_remediation',
    description: 'Belirli bir CVE kodu için Hosteva SecPanel Türkçe AI açıklamasını, risk analizini ve güvenli hedef sürümü döner.',
    inputSchema: {
      type: 'object',
      properties: {
        cve_id: { type: 'string', description: 'CVE Kodu (Örn: CVE-2024-38856)' }
      },
      required: ['cve_id']
    }
  },
  {
    name: 'get_quota_status',
    description: 'Hosteva SecPanel hesabınızın günlük paket tarama kotasını, bugün taranan paket sayısını, kalan kotayı ve dakikalık hız limitini sorgular.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

async function handleToolCall(name, args) {
  if (name === 'scan_dependencies') {
    const rawPackages = [];

    if (Array.isArray(args?.packages) && args.packages.length > 0) {
      for (const p of args.packages) {
        if (p && p.name && p.version) {
          rawPackages.push({
            name: String(p.name).trim(),
            version: cleanVersion(p.version),
            ecosystem: p.ecosystem || 'npm'
          });
        }
      }
    }

    if (args?.raw_content) {
      const parsed = parseRawContent(args.raw_content, args.file_type);
      rawPackages.push(...parsed);
    }

    if (args?.lock_file_path) {
      if (!isAllowedLockFile(args.lock_file_path)) {
        throw new Error(`Güvenlik Kısıtlaması: '${path.basename(args.lock_file_path)}' izin verilen bir kilit veya bildirim dosyası değildir. Yalnızca bilinen bağımlılık dosyaları taranabilir.`);
      }
      if (!fs.existsSync(args.lock_file_path)) {
        throw new Error(`Belirtilen kilit dosyası bulunamadı: ${args.lock_file_path}`);
      }
      try {
        const content = fs.readFileSync(args.lock_file_path, 'utf8');
        const parsed = parseRawContent(content, path.basename(args.lock_file_path));
        rawPackages.push(...parsed);
      } catch (err) {
        if (err.message && err.message.startsWith('Güvenlik')) throw err;
      }
    }

    const targetDir = args?.project_dir || (rawPackages.length === 0 ? process.cwd() : null);
    if (targetDir && fs.existsSync(targetDir)) {
      const dirPkgs = parseDependenciesFromDir(targetDir, { includeTransitive: Boolean(args?.include_transitive) });
      rawPackages.push(...dirPkgs);
    }

    const seen = new Set();
    const uniquePkgs = [];
    for (const p of rawPackages) {
      const key = `${p.ecosystem || 'npm'}:${p.name}@${p.version || '*'}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePkgs.push(p);
      }
    }

    if (uniquePkgs.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Taranabilir bağımlılık bulunamadı. Lütfen "packages" parametresiyle doğrudan paket listesi sağlayın, "raw_content" ile lock/manifest içeriği iletin veya dizinde "package-lock.json", "composer.lock", "requirements.txt", "Pipfile.lock", "poetry.lock" vb. kilit dosyaları bulunduğundan emin olun.`
          }
        ]
      };
    }

    const cappedPkgs = uniquePkgs.slice(0, 500);
    const projectName = args?.project_name || (targetDir ? path.basename(targetDir) : 'Harici-Paket-Listesi');

    const CHUNK_SIZE = 25;
    const allResults = [];
    let totalScanned = 0;
    let totalVulns = 0;
    let criticalCount = 0;
    let highCount = 0;
    let lastQuota = null;

    for (let i = 0; i < cappedPkgs.length; i += CHUNK_SIZE) {
      const chunk = cappedPkgs.slice(i, i + CHUNK_SIZE);
      const response = await callSecpanelApi('/api/v1/mcp/scan', 'POST', {
        project_name: projectName,
        packages: chunk
      });

      if (response.results && Array.isArray(response.results)) {
        allResults.push(...response.results);
      }
      totalScanned += (response.summary?.scanned_packages || chunk.length);
      totalVulns += (response.summary?.total_vulnerabilities || 0);
      criticalCount += (response.summary?.critical_vulnerabilities || 0);
      highCount += (response.summary?.high_vulnerabilities || 0);
      if (response.quota) {
        lastQuota = response.quota;
      }
    }

    const aggregatedResponse = {
      success: true,
      project_name: projectName,
      summary: {
        scanned_packages: totalScanned,
        vulnerable_packages: allResults.filter(r => r.vulnerable).length,
        total_vulnerabilities: totalVulns,
        critical_vulnerabilities: criticalCount,
        high_vulnerabilities: highCount
      },
      results: allResults,
      quota: lastQuota
    };

    const quotaInfo = lastQuota
      ? `\n\n📊 [Hosteva SecPanel Kota Durumu]:\n- Günlük Toplam Kota: ${lastQuota.daily_package_quota} paket\n- Bugün Kullanılan: ${lastQuota.packages_scanned_today} paket\n- KALAN GÜNLÜK KOTA: ${lastQuota.remaining_quota} paket\n- Dakikalık İstek Limiti: ${lastQuota.rate_limit_per_min}/dk`
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `${JSON.stringify(aggregatedResponse, null, 2)}${quotaInfo}`
        }
      ]
    };
  }

  if (name === 'check_package') {
    const response = await callSecpanelApi('/api/v1/mcp/check-package', 'POST', {
      name: args.name,
      version: cleanVersion(args.version),
      ecosystem: args.ecosystem || 'npm'
    });

    const quotaInfo = response.quota
      ? `\n\n📊 [Hosteva SecPanel Kota]: Kalan Günlük Kota: ${response.quota.remaining_quota}/${response.quota.daily_package_quota} paket`
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `${JSON.stringify(response, null, 2)}${quotaInfo}`
        }
      ]
    };
  }

  if (name === 'get_cve_remediation') {
    const response = await callSecpanelApi(`/api/v1/mcp/cve/${encodeURIComponent(args.cve_id)}`, 'GET');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  if (name === 'get_quota_status') {
    const response = await callSecpanelApi('/api/v1/mcp/quota', 'GET');
    const q = response.quota || {};
    const t = response.tenant || {};
    const u = response.usage_today || {};

    const humanSummary = `Hosteva SecPanel Kota & Kullanım Durumu:
- Hesap: ${t.company_name || '-'} (${t.plan || 'Standard'} Plan)
- Günlük Paket Tarama Kotası: ${q.daily_package_quota || 0} paket
- Bugün Taranan Paket Sayısı: ${q.packages_scanned_today || 0} paket
- KALAN GÜNLÜK KOTA: ${q.remaining_quota || 0} paket (${q.usage_percent || '0%'} kullanıldı)
- Dakikalık İstek Hız Limiti: ${q.rate_limit_per_min || 60} istek/dk
- Kota Sıfırlanma: Her gün ${q.resets_at || '00:00 UTC'}
- Bugün Tespit Edilen Zafiyet: ${u.vulns_detected || 0} (${u.critical_vulns || 0} kritik)`;

    return {
      content: [
        {
          type: 'text',
          text: `${humanSummary}\n\n${JSON.stringify(response, null, 2)}`
        }
      ]
    };
  }

  throw new Error(`Bilinmeyen araç (tool): ${name}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (_) {
    return;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'hosteva-secpanel-mcp',
          version: '1.1.0'
        }
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  if (method === 'tools/call') {
    try {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const result = await handleToolCall(toolName, toolArgs);

      const response = {
        jsonrpc: '2.0',
        id,
        result
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (err) {
      const response = {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
    return;
  }

  if (id !== undefined) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Metod bulunamadı.' }
    }) + '\n');
  }
});

