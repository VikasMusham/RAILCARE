(async ()=>{
  const base = 'http://localhost:3000';
  function jprint(x){ console.log(JSON.stringify(x, null, 2)); }
  try{
    const create = await fetch(base + '/api/bookings', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ passengerName:'RejTest', station:'Secunderabad', trainName:'Test 101', coach:'S1', seat:'12', services:['Luggage'], language:'English', price:50 })
    });
    const cb = await create.json();
    console.log('---CREATE---'); jprint(cb);
    const assistsRes = await fetch(base + '/api/assistants');
    const assists = await assistsRes.json();
    console.log('---ASSISTANTS---'); jprint(assists);
    const verified = assists.find(a=>a.verified);
    if(!verified){ console.log('No verified assistant found'); return; }
    console.log('---CHOSE ASSISTANT---'); jprint(verified);
    const aid = verified._id;
    const bid = cb.booking._id || cb.bookingId;
    const accRes = await fetch(base + `/api/bookings/${bid}/accept`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ assistantId: aid }) });
    const acc = await accRes.json();
    console.log('---ACCEPT---'); jprint(acc);
    const rejRes = await fetch(base + `/api/bookings/${bid}/reject`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ assistantId: aid }) });
    const rej = await rejRes.json();
    console.log('---REJECT---'); jprint(rej);
    const finalRes = await fetch(base + `/api/bookings/${bid}`);
    const fin = await finalRes.json();
    console.log('---FINAL---'); jprint(fin);
  }catch(err){ console.error(err); }
})();
