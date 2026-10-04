(() => {
  'use strict';
  const DB_KEY = 'relay-demo-ledger-v1';
  const HISTORY_KEY = 'relay-demo-history-v1';
  const APPROVAL_THRESHOLD_USD = 2000;
  const invoices = [
    {id:'INV-2026-041',vendor:'Acme',date:'2026-09-28',amount:2480.00,currency:'USD',due:'2026-10-28',description:'September cloud hosting',source:'ap@acme.example',subject:'Invoice INV-2026-041 — September hosting'},
    {id:'INV-2026-038',vendor:'Acme',date:'2026-08-27',amount:2310.00,currency:'USD',due:'2026-09-26',description:'August cloud hosting',source:'ap@acme.example',subject:'Invoice INV-2026-038 — August hosting'},
    {id:'NS-8842',vendor:'Northstar',date:'2026-09-30',amount:975.50,currency:'USD',due:'2026-10-30',description:'Design systems support',source:'billing@northstar.example',subject:'Invoice NS-8842 — September services'},
    {id:'NS-8791',vendor:'Northstar',date:'2026-08-31',amount:940.00,currency:'USD',due:'2026-09-30',description:'Design systems support',source:'billing@northstar.example',subject:'Invoice NS-8791 — August services'}
  ];
  const $ = s => document.querySelector(s);
  const input = $('#taskInput'), runButton = $('#runButton'), runPanel = $('#runPanel');
  let running = false, runCount = 0, toastTimer, injectSearchFailure = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateLabel = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
  function renderLedger(){
    const rows=read(DB_KEY,[]);$('#entryCount').textContent=`${rows.length} ${rows.length===1?'record':'records'}`;
    $('#emptyLedger').hidden=rows.length>0;
    $('#ledgerRows').innerHTML=rows.slice(0,5).map(r=>`<tr><td>${escapeHtml(r.vendor)}</td><td>${escapeHtml(r.currency)} ${Number(r.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</td><td>${dateLabel(r.due)}</td><td><span class="status-verified">Verified</span></td></tr>`).join('');
    $('#runCount').textContent=read(HISTORY_KEY,[]).length;
  }
  function addStep(title, detail, icon='✓', type='done', meta=''){
    const item=document.createElement('div');item.className='timeline-item';
    const state=type==='pending'?'pending':type==='retry'?'retry':type==='error'?'error':'';
    item.innerHTML=`<span class="step-icon ${state}">${icon}</span><div class="step-body"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p>${meta?`<div class="step-meta">${escapeHtml(meta)}</div>`:''}</div>`;
    $('#timeline').append(item);item.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function finish(status, label, title){
    $('#runStatus').textContent=label;$('#runStatus').className=`run-status ${status}`;$('#runHeading').textContent=title;
    running=false;runButton.disabled=false;
  }
  function parseTask(text){
    const lower=text.toLowerCase();
    if(/\b(pay|payment|send|email|forward|delete|submit|upload)\b/.test(lower))return {error:'This prototype cannot make payments, send messages, or submit documents. No actions were taken.'};
    const vendorNames=[...new Set(invoices.map(x=>x.vendor))];
    const found=vendorNames.filter(v=>new RegExp(`\\b${v.toLowerCase()}\\b`,'i').test(text));
    const wantsInvoice=/invoice|bill|vendor|supplier/.test(lower);
    const wantsRecord=/ledger|record|enter|add|save|log|accounting|system/.test(lower);
    const wantsNotify=/tell me|let me know|notify|report|update me/.test(lower);
    if(!wantsInvoice)return {error:'I can currently handle invoice tasks. Try asking me to find an invoice and record it in the ledger.'};
    if(found.length===0)return {clarify:'Which vendor should I look for? This workspace has invoices from Acme and Northstar.'};
    if(found.length>1)return {clarify:`You mentioned ${found.join(' and ')}. Which vendor's invoice should I process?`};
    return {vendor:found[0],record:wantsRecord,notify:wantsNotify};
  }
  async function execute(){
    if(running)return;const task=input.value.trim();if(!task){toast('Describe the outcome you want Relay to complete.');input.focus();return}
    running=true;runButton.disabled=true;runPanel.hidden=false;$('#timeline').innerHTML='';$('#evidenceDetails').innerHTML='';$('#approvalBox').hidden=true;$('#evidenceText').textContent='Relay will show what it verified here.';$('#runHeading').textContent='Understanding your request';$('#runSubheading').textContent=task;$('#runStatus').textContent='Planning';$('#runStatus').className='run-status';runPanel.scrollIntoView({block:'nearest',behavior:'smooth'});
    const plan=parseTask(task);await sleep(300);
    if(plan.error){addStep('Task outside this prototype',plan.error,'!','error');$('#evidenceText').textContent='No actions were taken. The task was outside the supported invoice workflow.';finish('failed','Needs a different task','Unable to complete task');saveHistory(task,'unsupported');return}
    if(plan.clarify){addStep('Clarification needed',plan.clarify,'?','retry');$('#evidenceText').textContent='No changes were made while Relay waits for a more specific vendor.';finish('needs-input','Waiting for you','A quick question before I proceed');saveHistory(task,'needs_input');return}
    const intentParts=[`find the latest ${plan.vendor} invoice`,plan.record?'record it in the company ledger':null,plan.notify?'report the result':null].filter(Boolean);
    addStep('Goal understood',`I’ll ${intentParts.join(', then ')}.`,'✳','done','Task interpreted locally; no model API is configured');await sleep(450);
    addStep('Plan selected',`Search the invoice inbox → read the newest matching invoice → ${plan.record?'create a ledger record → verify the saved fields':'show the invoice details'}.`,'1','done');await sleep(400);
    let matches;
    injectSearchFailure=$('#simulateFailure').checked;$('#simulateFailure').checked=false;
    try{
      try{matches=await toolSearch(plan.vendor)}catch(firstError){
        addStep('Temporary inbox error',`${firstError.message} I’ll retry the read-only search once.`, '↻','retry','Retry 1 of 1');await sleep(500);
        matches=await toolSearch(plan.vendor);
      }
    }catch(err){addStep('Invoice inbox unavailable',err.message,'!','error');$('#evidenceText').textContent='The source tool failed after one retry. No ledger changes were made.';finish('failed','Run failed','Could not reach invoice inbox');saveHistory(task,'failed');return}
    if(!matches.length){addStep('No matching invoice',`The inbox has no invoices for ${plan.vendor}.`,'!','error');$('#evidenceText').textContent='Nothing was changed because no matching invoice was found.';finish('failed','No invoice found','Task could not be completed');saveHistory(task,'failed');return}
    const invoice=matches[0];addStep('Searched invoice inbox',`Found ${matches.length} ${plan.vendor} invoice${matches.length===1?'':'s'}; sorted by invoice date, newest first.`, '✓','done',`${matches.length} result${matches.length===1?'':'s'} · inbox.search`);await sleep(450);
    let extracted;
    try{extracted=await toolRead(invoice.id)}catch(err){addStep('Could not read invoice',err.message,'!','error');$('#evidenceText').textContent='The invoice was located but its fields could not be read.';finish('failed','Run failed','Invoice extraction failed');saveHistory(task,'failed');return}
    addStep('Read invoice details',`${invoice.subject}. Extracted invoice number, amount, vendor, invoice date, and due date.`, '✓','done',`read_invoice · ${invoice.id}`);await sleep(400);
    if(!plan.record){$('#evidenceText').textContent=`Found ${extracted.id} from ${extracted.vendor}. No ledger entry was requested.`;fillEvidence(extracted);finish('','Completed','Invoice found');saveHistory(task,'completed');return}
    if(!hasLedgerRecord(extracted.id)&&extracted.currency==='USD'&&extracted.amount>=APPROVAL_THRESHOLD_USD){
      addStep('Approval required',`This demo requires approval before writing invoices of $${APPROVAL_THRESHOLD_USD.toLocaleString('en-US')} or more.`, '?','retry',`Policy check · ${extracted.currency} ${Number(extracted.amount).toFixed(2)}`);
      $('#evidenceText').textContent='Review the invoice details and approve the ledger write to continue.';fillEvidence(extracted);
      const approved=await requestApproval(extracted);
      if(!approved){addStep('Write declined','No ledger record was created.','!','error','Human approval declined');$('#evidenceText').textContent='The write was declined. No ledger changes were made.';finish('needs-input','Write declined','Approval not granted');saveHistory(task,'rejected');return}
      addStep('Write approved','You approved this invoice for entry in the demo ledger.','✓','done','Human approval recorded');await sleep(250);
    }
    let entry;
    try{entry=await toolCreate(extracted)}catch(err){addStep('Ledger write failed',err.message,'!','error');$('#evidenceText').textContent='The invoice details were extracted, but a ledger entry was not created.';fillEvidence(extracted);finish('failed','Run failed','Could not record invoice');saveHistory(task,'failed');return}
    addStep(entry.reused?'Found existing record':'Added invoice to ledger',entry.reused?'A record for this invoice already exists. I’ll verify the existing entry instead of creating a duplicate.':`Created a ledger entry for ${extracted.id}.`,entry.reused?'↻':'✓','done',`ledger.create · ${entry.id}`);await sleep(400);
    const verification=await toolVerify(entry.id,extracted);
    if(!verification.ok){addStep('Verification failed','Saved ledger fields did not match the invoice. Please review the record.','!','error');$('#evidenceText').textContent='A record exists, but Relay could not verify that its fields match the invoice.';finish('failed','Review needed','Record needs review');saveHistory(task,'review');renderLedger();return}
    addStep('Verified completion',`Confirmed vendor, invoice number, amount, currency, and due date against the saved ledger record.`, '✓','done',`ledger.read · ${entry.id}`);
    if(plan.notify)addStep('Prepared completion summary',`Verified ${extracted.id}: ${extracted.currency} ${Number(extracted.amount).toFixed(2)}, due ${dateLabel(extracted.due)}.`, '✓','done','Displayed here; no message sent externally');
    $('#evidenceText').textContent=`${extracted.id} is saved in the company ledger and the key fields match the source invoice.`;fillEvidence(extracted);finish('','Completed','Task completed');saveHistory(task,'completed');renderLedger();
  }
  async function toolSearch(vendor){await sleep(450);if(injectSearchFailure){injectSearchFailure=false;throw Error('Temporary connection timeout.')}return invoices.filter(x=>x.vendor.toLowerCase()===vendor.toLowerCase()).sort((a,b)=>b.date.localeCompare(a.date))}
  async function toolRead(id){await sleep(350);const x=invoices.find(item=>item.id===id);if(!x)throw Error('Invoice not found in the inbox.');return {...x}}
  async function toolCreate(invoice){
    await sleep(450);let rows=read(DB_KEY,[]);const existing=rows.find(x=>x.invoiceId===invoice.id);if(existing)return {...existing,reused:true};
    const entry={...invoice,invoiceId:invoice.id,id:`LED-${String(Date.now()).slice(-7)}`,createdAt:new Date().toISOString()};rows=[entry,...rows];write(DB_KEY,rows);renderLedger();return entry;
  }
  async function toolVerify(entryId,source){await sleep(350);const saved=read(DB_KEY,[]).find(x=>x.id===entryId);if(!saved)return {ok:false};const fields=['vendor','amount','currency','due'];return {ok:saved.invoiceId===source.id&&fields.every(key=>saved[key]===source[key]),saved}}
  function hasLedgerRecord(invoiceId){return read(DB_KEY,[]).some(entry=>entry.invoiceId===invoiceId)}
  function requestApproval(invoice){
    const box=$('#approvalBox');box.hidden=false;$('#approvalSummary').textContent=`${invoice.vendor} · ${invoice.id} · ${invoice.currency} ${Number(invoice.amount).toFixed(2)}`;
    box.scrollIntoView({block:'nearest',behavior:'smooth'});
    return new Promise(resolve=>{
      const approve=()=>{cleanup();resolve(true)};
      const reject=()=>{cleanup();resolve(false)};
      const cleanup=()=>{box.hidden=true;$('#approveWrite').removeEventListener('click',approve);$('#rejectWrite').removeEventListener('click',reject)};
      $('#approveWrite').addEventListener('click',approve,{once:true});$('#rejectWrite').addEventListener('click',reject,{once:true});
    });
  }
  function fillEvidence(invoice){$('#evidenceDetails').innerHTML=`<div class="evidence-detail"><span>Invoice</span><strong>${escapeHtml(invoice.id)}</strong></div><div class="evidence-detail"><span>Vendor</span><strong>${escapeHtml(invoice.vendor)}</strong></div><div class="evidence-detail"><span>Amount</span><strong>${escapeHtml(invoice.currency)} ${Number(invoice.amount).toFixed(2)}</strong></div><div class="evidence-detail"><span>Issued</span><strong>${dateLabel(invoice.date)}</strong></div><div class="evidence-detail"><span>Due date</span><strong>${dateLabel(invoice.due)}</strong></div><div class="evidence-detail"><span>Source</span><strong>${escapeHtml(invoice.source)}</strong></div><div class="evidence-source">${escapeHtml(invoice.subject)}</div>`}
  function saveHistory(task,status){const history=read(HISTORY_KEY,[]);history.unshift({task,status,at:new Date().toISOString()});write(HISTORY_KEY,history.slice(0,30));renderLedger()}
  document.querySelectorAll('.suggestion').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.task;input.focus()}));
  runButton.addEventListener('click',execute);
  input.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter')execute()});
  $('#resetButton').addEventListener('click',()=>{if(running)return toast('Wait until the current task finishes.');localStorage.removeItem(DB_KEY);localStorage.removeItem(HISTORY_KEY);renderLedger();runPanel.hidden=true;$('#activitySubtitle').textContent='A live view of the tools Relay can use.';toast('Demo ledger and task history cleared.')});
  $('#navRuns').addEventListener('click',()=>{if(runPanel.hidden){toast('Run a task to see its execution history.');return}runPanel.scrollIntoView({behavior:'smooth',block:'center'})});
  const dialog=$('#aboutDialog');$('.help-button').addEventListener('click',()=>dialog.showModal());$('.dialog-close').addEventListener('click',()=>dialog.close());$('.dialog-ok').addEventListener('click',()=>dialog.close());
  renderLedger();
})();
