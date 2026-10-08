SWISH eBay CSV IMPORT — READY-TO-PASTE PATCH
================================================

This patch is designed for:
troonvinyl-ux/KeenOnCoins_Capture_Station

It uses the EXISTING SWISH backend and existing `ebay-import-csv` Edge Function.
It does NOT create a database, table, authentication system, or new backend.

The supplied real eBay export contains these 30 columns:
Item number
Title
Variation details
Custom label (SKU)
Available quantity
Format
Currency
Start price
Auction Buy It Now price
Reserve price
Current price
Sold quantity
Watchers
Bids
Start date
End date
eBay category 1 name
eBay category 1 number
eBay category 2 name
eBay category 2 number
Condition
CD:Professional Grader - (ID: 27501)
CD:Grade - (ID: 27502)
CDA:Certification Number - (ID: 27503)
CD:Card Condition - (ID: 40001)
eBay Product ID(ePID)
Listing site
P:UPC
P:EAN
P:ISBN

The supplied file has 206 rows.

IMPORTANT:
1. Keep the existing SWISH backend/database.
2. Keep using SWISH.functions.ebayImport = 'ebay-import-csv'.
3. Do not create another inventory database.
4. The CSV is an import/update source for existing eBay inventory.
5. Match existing records by eBay Item number first, then SKU.
6. Do not create duplicate records when an item already exists.
7. Do not erase existing SWISH images/descriptions/AI data merely because the CSV does not contain them.
8. Do not report success until the backend import responds successfully.
9. Keep eBay credentials server-side.
10. Keep Simple Delivery for new eBay submissions.

PATCH 1 — REPLACE THE CURRENT `if(S.sub==='import')` BLOCK
------------------------------------------------------------

Find this existing block inside `renderEbaySub()`:

if(S.sub==='import'){
  replaceView(base+`<h2>eBay Import / Export</h2><div class="two"><div><select id="impType"><option>listings</option><option>orders</option><option>inventory</option><option>categories</option></select><input id="csvFile" type="file" accept=".csv,.xlsx"><button class="btn primary" id="importCsv">Import</button></div><div><button class="btn" id="exportCsv">Export</button></div></div><div id="ebaySubBox"></div></div>`);
  return bindImport();
}

Replace it with:

if(S.sub==='import'){
  replaceView(base+`
    <h2>eBay CSV Import</h2>
    <p class="muted">
      Import an eBay Active Listings CSV into the existing SWISH inventory.
      Existing records are matched by eBay Item number or SKU and updated rather than duplicated.
    </p>

    <div class="card">
      <div class="toolbar">
        <input id="csvFile" type="file" accept=".csv,text/csv">
        <button class="btn primary" id="importCsv">Analyse CSV</button>
        <button class="btn" id="exportCsv">Export</button>
      </div>

      <div class="toolbar" style="margin-top:10px">
        <span class="tag">eBay Active Listings</span>
        <span class="tag">Existing SWISH database</span>
        <span class="tag">No duplicate import</span>
      </div>
    </div>

    <div id="ebaySubBox">
      <div class="empty">
        Select an eBay Active Listings CSV to begin.
      </div>
    </div>
  </div>`);
  return bindImport();
}

PATCH 2 — REPLACE THE CURRENT `bindImport()` FUNCTION
-------------------------------------------------------

Replace the entire existing one-line `bindImport()` function with this:

async function bindImport(){

  const box = document.querySelector('#ebaySubBox');
  const fileInput = document.querySelector('#csvFile');
  const importBtn = document.querySelector('#importCsv');
  const exportBtn = document.querySelector('#exportCsv');

  if(!fileInput || !importBtn || !box) return;

  let parsed = null;

  importBtn.onclick = async () => {

    const file = fileInput.files?.[0];

    if(!file){
      toast('Choose an eBay CSV file first.', true);
      return;
    }

    if(!/\.csv$/i.test(file.name)){
      toast('Please choose an eBay CSV file.', true);
      return;
    }

    importBtn.disabled = true;
    importBtn.textContent = 'Reading CSV…';

    try{

      const textData = await file.text();
      parsed = parseEbayCsv(textData);

      if(!parsed.rows.length){
        throw new Error('The CSV contains no listing rows.');
      }

      renderEbayCsvPreview(parsed, file);

      importBtn.disabled = false;
      importBtn.textContent = 'Import into SWISH';

      importBtn.onclick = async () => {

        importBtn.disabled = true;
        importBtn.textContent = 'Importing…';

        const msg = document.querySelector('#csvImportMsg');

        if(msg){
          msg.innerHTML =
            '<div class="empty"><div class="spinner"></div>' +
            '<p>Sending eBay CSV to the existing SWISH backend…</p></div>';
        }

        try{

          /*
           * Keep the existing server-side import route.
           * The browser never receives or handles eBay credentials.
           */

          let csvUrl = '';

          try{

            const path =
              `imports/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;

            const up = await sb.storage
              .from('imports')
              .upload(path, file, {
                upsert:true,
                contentType:'text/csv'
              });

            if(!up.error){
              csvUrl =
                sb.storage
                  .from('imports')
                  .getPublicUrl(path)
                  .data
                  .publicUrl || '';
            }

          }catch(storageError){

            /*
             * Do not fail here. The backend can still receive the
             * parsed rows directly if its import function supports them.
             */
            console.warn('CSV storage upload unavailable:', storageError);

          }

          const payload = {
            type:'listings',
            filename:file.name,

            tenantId:S.tenant?.id,
            tenant_id:S.tenant?.id,

            csv_url:csvUrl || null,

            /*
             * Normalised rows are supplied as well as the original CSV URL.
             * This allows the existing Edge Function to use either route.
             */
            rows:parsed.rows,

            source:'ebay_active_listings_csv',

            mapping:{
              ebay_item_id:'Item number',
              title:'Title',
              sku:'Custom label (SKU)',
              quantity:'Available quantity',
              format:'Format',
              currency:'Currency',
              start_price:'Start price',
              buy_it_now_price:'Auction Buy It Now price',
              current_price:'Current price',
              sold_quantity:'Sold quantity',
              watchers:'Watchers',
              bids:'Bids',
              start_date:'Start date',
              end_date:'End date',
              category_1_name:'eBay category 1 name',
              category_1_id:'eBay category 1 number',
              category_2_name:'eBay category 2 name',
              category_2_id:'eBay category 2 number',
              condition:'Condition',
              epid:'eBay Product ID(ePID)',
              listing_site:'Listing site',
              upc:'P:UPC',
              ean:'P:EAN',
              isbn:'P:ISBN'
            },

            match_priority:[
              'ebay_item_id',
              'sku'
            ],

            preserve_existing_fields:[
              'images',
              'media',
              'image_urls',
              'description',
              'identification_data',
              'identification_confidence',
              'attributes',
              'valuation_low',
              'valuation_mid',
              'valuation_high',
              'valuation_confidence',
              'expected_selling_price',
              'expected_profit'
            ],

            prevent_duplicates:true
          };

          const result = await edge(
            SWISH.functions.ebayImport,
            payload
          );

          box.innerHTML = `
            <div class="card">
              <div class="success">
                <h3>eBay CSV import completed</h3>
                <p>
                  The existing SWISH backend accepted the import.
                </p>
              </div>

              <div class="grid">
                <div class="card metric">
                  <span class="muted">CSV rows</span>
                  <b>${parsed.rows.length}</b>
                </div>

                <div class="card metric">
                  <span class="muted">eBay Item IDs</span>
                  <b>${parsed.rows.filter(r=>r.ebay_item_id).length}</b>
                </div>

                <div class="card metric">
                  <span class="muted">SKUs</span>
                  <b>${parsed.rows.filter(r=>r.sku).length}</b>
                </div>

                <div class="card metric">
                  <span class="muted">Currency</span>
                  <b>${esc(parsed.currencies.join(', ') || '—')}</b>
                </div>
              </div>

              <details style="margin-top:12px">
                <summary>Backend response</summary>
                <pre class="pre">${esc(JSON.stringify(result,null,2))}</pre>
              </details>

              <div class="toolbar" style="margin-top:12px">
                <button class="btn primary" id="refreshAfterCsv">Refresh SWISH inventory</button>
                <button class="btn" id="importAnotherCsv">Import another CSV</button>
              </div>

              <div id="csvImportMsg"></div>
            </div>`;

          document.querySelector('#refreshAfterCsv')?.addEventListener('click',()=>{
            S.sub='ebayListings';
            renderEbaySub();
          });

          document.querySelector('#importAnotherCsv')?.addEventListener('click',()=>{
            S.sub='import';
            renderEbaySub();
          });

          toast('eBay CSV imported successfully');

        }catch(e){

          const msg = document.querySelector('#csvImportMsg');

          if(msg){
            msg.innerHTML =
              `<div class="error"><b>Import failed.</b><br>${esc(e.message)}</div>`;
          }

          importBtn.disabled = false;
          importBtn.textContent = 'Import into SWISH';

          toast(e.message || 'eBay CSV import failed', true);
        }
      };

    }catch(e){

      importBtn.disabled = false;
      importBtn.textContent = 'Analyse CSV';

      box.innerHTML =
        `<div class="error"><b>CSV could not be read.</b><br>${esc(e.message)}</div>`;

      toast(e.message || 'CSV could not be read', true);
    }
  };

  if(exportBtn){

    exportBtn.onclick = async () => {

      try{

        const d = await edge(
          SWISH.functions.ebayExport,
          {
            type:'listings',
            tenantId:S.tenant?.id,
            tenant_id:S.tenant?.id
          }
        );

        if(d?.url){
          window.open(d.url,'_blank');
        }else{
          toast('Export triggered');
        }

      }catch(e){
        toast(e.message,true);
      }
    };

  }
}

PATCH 3 — ADD THESE CSV HELPER FUNCTIONS
------------------------------------------

Place the following functions immediately before `bindImport()`:

function detectCsvDelimiter(text){

  const firstLines = String(text||'')
    .split(/\r?\n/)
    .filter(x=>x.trim())
    .slice(0,5)
    .join('\n');

  const candidates = [',',';','\t'];

  let best = ',';
  let bestScore = -1;

  for(const delimiter of candidates){

    let score = 0;
    let inside = false;

    for(let i=0;i<firstLines.length;i++){

      const ch = firstLines[i];

      if(ch === '"'){

        if(inside && firstLines[i+1] === '"'){
          i++;
          continue;
        }

        inside = !inside;
        continue;
      }

      if(!inside && ch === delimiter){
        score++;
      }
    }

    if(score > bestScore){
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}


function parseCsvRows(text,delimiter){

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  const source = String(text||'').replace(/^\uFEFF/,'');

  for(let i=0;i<source.length;i++){

    const ch = source[i];
    const next = source[i+1];

    if(ch === '"'){

      if(quoted && next === '"'){
        cell += '"';
        i++;
      }else{
        quoted = !quoted;
      }

      continue;
    }

    if(!quoted && ch === delimiter){

      row.push(cell);
      cell = '';
      continue;
    }

    if(!quoted && (ch === '\n' || ch === '\r')){

      if(ch === '\r' && next === '\n'){
        i++;
      }

      row.push(cell);
      cell = '';

      if(row.some(v=>String(v).trim() !== '')){
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += ch;
  }

  if(cell.length || row.length){

    row.push(cell);

    if(row.some(v=>String(v).trim() !== '')){
      rows.push(row);
    }
  }

  return rows;
}


function normaliseEbayHeader(value){

  return String(value||'')
    .trim()
    .replace(/^\uFEFF/,'')
    .replace(/\s+/g,' ')
    .toLowerCase();
}


function csvNumber(value){

  if(value === null || value === undefined || value === ''){
    return null;
  }

  const cleaned =
    String(value)
      .replace(/[£$€,\s]/g,'')
      .trim();

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : null;
}


function parseEbayCsv(text){

  const delimiter = detectCsvDelimiter(text);
  const matrix = parseCsvRows(text,delimiter);

  if(!matrix.length){
    throw new Error('No rows found in CSV.');
  }

  const headers = matrix[0].map(x=>String(x||'').trim());

  const headerMap = {};

  headers.forEach((h,i)=>{
    headerMap[normaliseEbayHeader(h)] = i;
  });

  const get = (row,name) => {

    const i = headerMap[normaliseEbayHeader(name)];

    if(i === undefined){
      return '';
    }

    return String(row[i] ?? '').trim();
  };

  const rows = matrix
    .slice(1)
    .map(raw => {

      const itemNumber = get(raw,'Item number');
      const sku = get(raw,'Custom label (SKU)');

      return {

        /*
         * Original eBay fields
         */
        ebay_item_id:itemNumber,
        title:get(raw,'Title'),
        variation_details:get(raw,'Variation details'),
        sku:sku,

        available_quantity:
          csvNumber(get(raw,'Available quantity')),

        format:get(raw,'Format'),
        currency:get(raw,'Currency'),

        start_price:
          csvNumber(get(raw,'Start price')),

        auction_buy_it_now_price:
          csvNumber(get(raw,'Auction Buy It Now price')),

        reserve_price:
          csvNumber(get(raw,'Reserve price')),

        current_price:
          csvNumber(get(raw,'Current price')),

        sold_quantity:
          csvNumber(get(raw,'Sold quantity')),

        watchers:
          csvNumber(get(raw,'Watchers')),

        bids:
          csvNumber(get(raw,'Bids')),

        start_date:get(raw,'Start date'),
        end_date:get(raw,'End date'),

        ebay_category_1_name:
          get(raw,'eBay category 1 name'),

        ebay_category_1_id:
          get(raw,'eBay category 1 number'),

        ebay_category_2_name:
          get(raw,'eBay category 2 name'),

        ebay_category_2_id:
          get(raw,'eBay category 2 number'),

        condition:
          get(raw,'Condition'),

        professional_grader:
          get(raw,'CD:Professional Grader - (ID: 27501)'),

        grade:
          get(raw,'CD:Grade - (ID: 27502)'),

        certification_number:
          get(raw,'CDA:Certification Number - (ID: 27503)'),

        card_condition:
          get(raw,'CD:Card Condition - (ID: 40001)'),

        epid:
          get(raw,'eBay Product ID(ePID)'),

        listing_site:
          get(raw,'Listing site'),

        upc:
          get(raw,'P:UPC'),

        ean:
          get(raw,'P:EAN'),

        isbn:
          get(raw,'P:ISBN'),

        /*
         * Normalised SWISH values
         */
        price:
          csvNumber(get(raw,'Current price')) ??
          csvNumber(get(raw,'Start price')),

        quantity:
          csvNumber(get(raw,'Available quantity')) ?? 1,

        category:
          get(raw,'eBay category 1 name'),

        category_id:
          get(raw,'eBay category 1 number'),

        marketplace:'ebay',
        marketplace_id:'ebay',
        listing_status:'active'
      };

    })
    .filter(r=>r.ebay_item_id || r.sku || r.title);

  const currencies =
    [...new Set(rows.map(r=>r.currency).filter(Boolean))];

  return {
    delimiter,
    headers,
    rows,
    currencies
  };
}


function renderEbayCsvPreview(parsed,file){

  const box = document.querySelector('#ebaySubBox');

  if(!box) return;

  const rows = parsed.rows;

  const priced =
    rows.filter(r=>Number.isFinite(Number(r.price)));

  const categories =
    rows.filter(r=>r.ebay_category_1_id);

  const skus =
    rows.filter(r=>r.sku);

  const totalValue =
    priced.reduce((sum,r)=>sum+Number(r.price||0),0);

  const sample = rows.slice(0,25);

  box.innerHTML = `

    <div class="card">

      <div class="toolbar">

        <div>
          <h3 style="margin:0">CSV ready to import</h3>
          <div class="muted">${esc(file.name)}</div>
        </div>

        <span class="tag">${rows.length} rows</span>

      </div>

      <div class="grid">

        <div class="card metric">
          <span class="muted">Listings</span>
          <b>${rows.length}</b>
        </div>

        <div class="card metric">
          <span class="muted">SKUs</span>
          <b>${skus.length}</b>
        </div>

        <div class="card metric">
          <span class="muted">eBay categories</span>
          <b>${categories.length}</b>
        </div>

        <div class="card metric">
          <span class="muted">Listed value</span>
          <b>${money(totalValue)}</b>
        </div>

      </div>

      <div style="margin-top:16px">

        <h3>eBay → SWISH mapping</h3>

        <div class="table-wrap">

          <table class="tbl">

            <thead>
              <tr>
                <th>eBay field</th>
                <th>SWISH field</th>
              </tr>
            </thead>

            <tbody>

              <tr>
                <td>Item number</td>
                <td>eBay Item ID / external listing ID</td>
              </tr>

              <tr>
                <td>Title</td>
                <td>title / canonical_title</td>
              </tr>

              <tr>
                <td>Custom label (SKU)</td>
                <td>sku</td>
              </tr>

              <tr>
                <td>Current price</td>
                <td>price / expected selling price</td>
              </tr>

              <tr>
                <td>Available quantity</td>
                <td>quantity</td>
              </tr>

              <tr>
                <td>eBay category 1 name/number</td>
                <td>eBay category name/ID</td>
              </tr>

              <tr>
                <td>Condition</td>
                <td>condition</td>
              </tr>

              <tr>
                <td>Listing site</td>
                <td>marketplace/site</td>
              </tr>

            </tbody>

          </table>

        </div>

      </div>

      <div style="margin-top:16px">

        <h3>Preview — first ${Math.min(25,rows.length)} listings</h3>

        <div class="table-wrap">

          <table class="tbl">

            <thead>

              <tr>
                <th>eBay ID</th>
                <th>SKU</th>
                <th>Title</th>
                <th>Category</th>
                <th>Price</th>
              </tr>

            </thead>

            <tbody>

              ${sample.map(r=>`

                <tr>

                  <td>${esc(r.ebay_item_id)}</td>

                  <td>${esc(r.sku)}</td>

                  <td>${esc(r.title)}</td>

                  <td>
                    ${esc(r.ebay_category_1_name || '—')}
                    ${r.ebay_category_1_id ? ` · ${esc(r.ebay_category_1_id)}` : ''}
                  </td>

                  <td>${money(r.price)}</td>

                </tr>

              `).join('')}

            </tbody>

          </table>

        </div>

      </div>

      <div class="card" style="margin-top:16px">

        <b>Important</b>

        <p class="muted">
          Importing this CSV updates the existing SWISH/eBay inventory.
          It must not create duplicates and must not wipe existing SWISH
          images, descriptions, identification, valuation or learning data.
        </p>

        <div id="csvImportMsg"></div>

      </div>

    </div>`;
}


PATCH 4 — EXPECTED BACKEND BEHAVIOUR
-------------------------------------

The existing `ebay-import-csv` Edge Function should accept:

{
  type: "listings",
  tenantId,
  tenant_id,
  filename,
  csv_url,
  rows,
  source: "ebay_active_listings_csv",
  mapping,
  match_priority: ["ebay_item_id","sku"],
  preserve_existing_fields: [...],
  prevent_duplicates: true
}

For each CSV row:

A. Match by existing eBay Item ID first.

B. If no Item ID match, match by SKU.

C. If a match exists:
   UPDATE the existing record.

D. If no match exists:
   INSERT one inventory/listing record using the existing SWISH schema.

E. Never create a second database/table.

F. Do not overwrite these existing SWISH fields with empty CSV values:
   - images
   - media
   - image_urls
   - description
   - identification_data
   - identification_confidence
   - attributes
   - valuation_low
   - valuation_mid
   - valuation_high
   - valuation_confidence
   - expected_selling_price
   - expected_profit

G. Store the eBay category ID and name from:
   eBay category 1 number
   eBay category 1 name

H. Store the original eBay Item number as the canonical external listing identifier.

I. Keep Listing site = UK/eBay where present.

J. Keep currency = GBP for this supplied export.

K. Keep listing status = active.

L. Return a result such as:

{
  "success": true,
  "total": 206,
  "inserted": 0,
  "updated": 206,
  "duplicates": 0,
  "failed": 0,
  "errors": []
}

The actual counts will depend on the current SWISH database.

IMPORTANT SECURITY NOTE
-----------------------

The CSV importer must never expose:
- eBay client secret
- eBay access token
- eBay refresh token

Those remain in the existing server-side connector/Edge Function system.

The browser only uploads the CSV and calls the existing backend.

END OF PATCH


PATCH 5 — PROVEN eBAY CATEGORY LIBRARY
----------------------------------------

This is the important extra part.

The supplied 206-row CSV contains 53 distinct Category 1 ID/name pairs.
The importer already captures:

  ebay_category_1_id
  ebay_category_1_name
  category_id
  category

The following addition makes SWISH automatically build a "Proven eBay
Categories" library from the categories already stored in the EXISTING
inventory and eBay listings data.

NO NEW TABLE IS REQUIRED.

It means categories coming from your real eBay CSV become reusable,
evidence-based category choices inside SWISH.

ADD THIS FUNCTION anywhere before `loadCategoryManager()`:

async function getProvenEbayCategories(){

  const inventory = await safeTable('inventory',{limit:5000});
  const listings = await safeTable('ebay_listings',{limit:5000});

  const all = [...inventory,...listings];
  const map = new Map();

  for(const row of all){

    const a = obj(row.attributes || row.identification_data || {});

    const id =
      row.ebay_category_id ||
      row.category_id ||
      row.ebay_categoryId ||
      a.ebay_category_id ||
      a.category_id ||
      '';

    const name =
      row.ebay_category_name ||
      row.category_name ||
      row.category ||
      a.ebay_category_name ||
      a.category_name ||
      '';

    if(!id) continue;

    const key = String(id).trim();

    if(!map.has(key)){
      map.set(key,{
        id:key,
        name:String(name || '').trim(),
        count:0
      });
    }

    const item = map.get(key);

    item.count++;

    if(!item.name && name){
      item.name = String(name).trim();
    }
  }

  return [...map.values()].sort((a,b)=>{

    if(b.count !== a.count){
      return b.count-a.count;
    }

    return String(a.name).localeCompare(String(b.name));
  });
}


ADD THIS FUNCTION immediately after it:

async function renderProvenEbayCategories(){

  const box = document.querySelector('#provenCatBox');

  if(!box) return;

  try{

    const cats = await getProvenEbayCategories();

    if(!cats.length){

      box.innerHTML =
        '<div class="empty">No proven eBay categories stored yet. ' +
        'Import your eBay Active Listings CSV first.</div>';

      return;
    }

    box.innerHTML = `

      <div class="card">

        <div class="toolbar">

          <div class="grow">
            <h3 style="margin:0">Proven eBay Categories</h3>
            <div class="muted">
              These category IDs have been supplied by real eBay listings
              already stored in SWISH. They are not AI guesses.
            </div>
          </div>

          <span class="tag">${cats.length} proven IDs</span>

        </div>

        <div style="margin-top:10px">
          <input
            id="provenCatSearch"
            placeholder="Search proven category name or ID"
            style="width:100%"
          >
        </div>

        <div id="provenCatRows" style="margin-top:10px"></div>

      </div>`;

    const render = (term='') => {

      const q = String(term||'').toLowerCase().trim();

      const filtered = cats.filter(c =>
        !q ||
        String(c.id).toLowerCase().includes(q) ||
        String(c.name).toLowerCase().includes(q)
      );

      const rows = filtered.slice(0,100);

      document.querySelector('#provenCatRows').innerHTML =
        rows.length
        ? rows.map(c=>`

          <div class="row">

            <div class="grow">

              <div class="title">
                ${esc(c.name || 'Unnamed eBay category')}
              </div>

              <div class="muted">
                eBay Category ID: <b>${esc(c.id)}</b>
                · used by ${c.count} stored listing${c.count===1?'':'s'}
              </div>

            </div>

            <button
              class="btn"
              data-copy-category="${esc(c.id)}"
              data-category-name="${esc(c.name)}">
              Copy ID
            </button>

          </div>

        `).join('')
        : '<div class="empty">No matching proven categories.</div>';

      document.querySelectorAll('[data-copy-category]').forEach(btn=>{

        btn.onclick = async () => {

          const id = btn.dataset.copyCategory || '';
          const name = btn.dataset.categoryName || '';

          try{
            await navigator.clipboard.writeText(id);
            toast(`Copied eBay Category ${id} · ${name}`);
          }catch(_){
            prompt('eBay Category ID',id);
          }

        };

      });

    };

    render('');

    document.querySelector('#provenCatSearch').oninput =
      e => render(e.target.value);

  }catch(e){

    box.innerHTML =
      `<div class="error">
        Could not build proven category library.<br>
        ${esc(e.message)}
      </div>`;

  }
}


CHANGE the `loadCategoryManager()` HTML so it contains:

<div id="provenCatBox"></div>

Place it above the existing:

<div id="catBox">...</div>

Then, at the end of `loadCategoryManager()`, after:

await loadCategoryChoices();

ADD:

await renderProvenEbayCategories();


RESULT:

The Category Manager will show:

  Proven eBay Categories
  ├── category name
  ├── real eBay category ID
  ├── number of SWISH listings using it
  └── Copy ID

This library is derived from the existing SWISH database, so it does not
introduce another database or table.


PATCH 6 — SAVE CATEGORY DATA DURING CSV IMPORT
-----------------------------------------------

The existing CSV parser already creates:

  ebay_category_1_id
  ebay_category_1_name
  ebay_category_2_id
  ebay_category_2_name
  category_id
  category

Keep all of those fields in the `rows` payload.

The existing `ebay-import-csv` Edge Function should map Category 1 into
the existing SWISH category fields:

  ebay_category_id
  ebay_category_name
  category_id
  category

If the existing schema supports the secondary category fields, also
preserve:

  ebay_category_2_id
  ebay_category_2_name

Do NOT create a new category table.

The important rule is:

CSV Category 1 ID → existing SWISH category ID field

CSV Category 1 Name → existing SWISH category name field


PATCH 7 — OPTIONAL FRONTEND SAFETY FOR CATEGORY ASSIGNMENT
------------------------------------------------------------

When `openCategoryEditor()` displays its category search/editor, add a
"Proven categories" section using:

const proven = await getProvenEbayCategories();

Then display the most frequently used proven categories first.

Each category should show:

  Name
  ID
  Use this category

The "Use this category" button should populate the existing category ID
and category name inputs in the editor.

Do NOT replace the existing live eBay taxonomy search.

The order should be:

1. Proven categories from the user's own eBay data
2. Existing live eBay taxonomy/category search
3. Manual ID/name entry as the fallback

This means SWISH can use a known-good category immediately, while still
allowing a new eBay category to be searched when required.


PATCH 8 — PROVEN CATEGORY DATA FROM THE CURRENT CSV
-----------------------------------------------------

For reference, the supplied 206-row eBay CSV contains these 53 distinct
Category 1 IDs/names:

 51 listings |     534 | Asia
 20 listings |    4738 | Greek
 12 listings |  122472 | Roman Imperial (235-476AD)
 11 listings |    4735 | Roman Provincial
 11 listings |    4737 | Persian, Indian
  9 listings |     539 | France
  6 listings |   58531 | Channel Islands
  6 listings |     533 | Africa
  5 listings |    4734 | Roman Republican (c.300-27 BC)
  5 listings |   45153 | Hungary
  4 listings |     542 | Latin America/Caribbean
  4 listings |   39480 | Italy
  4 listings |    3455 | 18th Century
  4 listings |    4739 | Islamic
  3 listings |    3365 | Roman Imperial (96-235AD)
  3 listings |     540 | Germany
  3 listings |    4941 | Other European Coins
  3 listings |   39481 | Spain
  2 listings |   39479 | Austria
  2 listings |  122471 | Roman Imperial (27BC-96AD)
  2 listings |     548 | Publications
  2 listings |   29223 | Antiquarian & Collectable
  2 listings |   75338 | Isle of Man
  2 listings |   72040 | Malta
  2 listings |   45157 | Portugal
  1 listings |  141097 | Shilling
  1 listings |     553 | Art Sculptures
  1 listings |    3356 | 2, 3 & 20 Cents
  1 listings |   79964 | Other British Coins
  1 listings |   33564 | Brake Disc Rotors
  1 listings |   42284 | Sanders
  1 listings |   57357 | Brake Pads
  1 listings |  261186 | Books
  1 listings |    1350 | Codd, Patent & Mineral Bottles
  1 listings |   22679 | Bike Frames
  1 listings |   98764 | Threepence
  1 listings |  141091 | Half-Penny
  1 listings |  141165 | 20th Century
  1 listings |   72385 | 19th Century
  1 listings |   58532 | Middle East
  1 listings |  101150 | Boer War (1899-1902)
  1 listings |  141125 | Florin/Two Shillings
  1 listings |   45152 | Greece
  1 listings |   45159 | Turkey
  1 listings |    4740 | Chinese
  1 listings |   11951 | Nickels
  1 listings |   58535 | European
  1 listings |  122475 | Celtic Coins (c.100BC-c.100AD)
  1 listings |   45154 | Netherlands
  1 listings |  141123 | Sixpence
  1 listings |  141121 | Threepence
  1 listings |     536 | Canada
  1 listings |   72384 | 17th Century


These are examples of the kind of proven data SWISH will learn from.
The importer must NOT hard-code these 53 categories as a permanent
database list. They are shown here only as verification of the supplied
CSV.

The actual application should derive the library dynamically from
existing imported eBay/inventory records.

PATCH 9 — IMPORTANT IMPORT RULES
---------------------------------

The finished importer must behave like this:

eBay CSV
   ↓
Parse locally
   ↓
Read Item number + SKU + Category ID/Name
   ↓
Send normalised rows to existing `ebay-import-csv`
   ↓
Match existing eBay Item ID
   ↓
If no match, match SKU
   ↓
Update existing record OR insert once
   ↓
Preserve existing SWISH images / descriptions / identification /
valuation / learning data
   ↓
Store proven eBay category ID + name
   ↓
Category Manager derives its Proven Category Library from those records

Do NOT:

- create another database
- create another Supabase project
- create another inventory table
- create another authentication system
- invent category IDs
- replace the existing eBay taxonomy search
- overwrite existing AI identification merely because a CSV row lacks it
- overwrite existing images merely because a CSV row lacks image URLs
- expose eBay credentials in the browser
- change the existing eBay OAuth architecture
- change Simple Delivery requirements

The CSV is the source of truth for eBay listing/category information,
while the existing SWISH database remains the canonical application
database.
