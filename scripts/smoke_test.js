(async ()=>{
  const base='http://localhost:3000';
  const jprint = (label, obj)=>{ console.log('\n=== '+label+' ==='); console.log(JSON.stringify(obj, null, 2)); };
  try{
    // create admin
    const adminRes = await fetch(base + '/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'AdminUser', phone:'9000000001', password:'adminpass', role:'admin' }) });
    const admin = await adminRes.json(); jprint('admin', admin);
    const adminToken = admin.token;

    // create assistant
    const asstRes = await fetch(base + '/api/assistants/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'TestAssistant', station:'Secunderabad', languages:['English'] }) });
    const asst = await asstRes.json(); jprint('assistantCreated', asst);
    const asstId = asst.assistant._id || asst.assistantId || asst._id;

    // approve assistant as admin
    const approveRes = await fetch(base + `/api/assistants/${asstId}/approve`, { method:'POST', headers:{ 'Authorization': 'Bearer '+adminToken } });
    const approve = await approveRes.json(); jprint('assistantApproved', approve);

    // create passenger
    const passRes = await fetch(base + '/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'P1', phone:'9000000002', password:'pass', role:'passenger' }) });
    const pass = await passRes.json(); jprint('passenger', pass);
    const passToken = pass.token;

    // create booking
    const createRes = await fetch(base + '/api/bookings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ passengerName:'P1', station:'Secunderabad', trainName:'Express 1', coach:'S1', seat:'12', services:['Luggage'], language:'English', price:120 }) });
    const booking = await createRes.json(); jprint('bookingCreated', booking);
    const bookingId = booking.booking?._id || booking.bookingId || booking._id;

    // accept booking as assistant (no JWT required)
    const acceptRes = await fetch(base + `/api/bookings/${bookingId}/accept`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ assistantId: asstId }) });
    const acc = await acceptRes.json(); jprint('accepted', acc);

    // verify OTP (assistant uses booking.otp)
    const otp = booking.booking?.otp || booking.otp;
    const verifyRes = await fetch(base + `/api/bookings/${bookingId}/verify-otp`, { method:'POST', headers:{'Content-Type':'application/json', 'Authorization': 'Bearer '+adminToken }, body: JSON.stringify({ otp }) });
    // Note: verify endpoint requires assistant auth; we don't have assistant token, so using admin token may be rejected. We'll attempt without auth as fallback.
    let verify;
    if (verifyRes.ok) { verify = await verifyRes.json(); jprint('verifyWithAdmin', verify); }
    else {
      const v2 = await fetch(base + `/api/bookings/${bookingId}/verify-otp`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ otp }) });
      verify = await v2.json(); jprint('verifyWithoutAuth', verify);
    }

    // request completion (assistant)
    const compReq = await fetch(base + `/api/bookings/${bookingId}/complete-request`, { method:'POST', headers:{'Content-Type':'application/json', 'Authorization': 'Bearer '+adminToken } });
    let compRes = await compReq.json(); jprint('completeRequest', compRes);
    if (!compReq.ok) {
      // try without auth
      const cr2 = await fetch(base + `/api/bookings/${bookingId}/complete-request`, { method:'POST' });
      compRes = await cr2.json(); jprint('completeRequestNoAuth', compRes);
    }

    // fetch booking to get completionOtp
    const fetchBooking = await fetch(base + `/api/bookings/${bookingId}`);
    const bookingNow = await fetchBooking.json(); jprint('bookingNow', bookingNow);
    const completionOtp = bookingNow.booking?.completionOtp;

    // passenger confirm completion (requires passenger auth token)
    if (completionOtp) {
      const confirm = await fetch(base + `/api/bookings/${bookingId}/confirm-completion`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+passToken }, body: JSON.stringify({ otp: completionOtp }) });
      const conf = await confirm.json(); jprint('confirmCompletion', conf);
    } else {
      console.log('No completionOtp to confirm');
    }

    // final booking state
    const final = await (await fetch(base + `/api/bookings/${bookingId}`)).json(); jprint('finalBooking', final);

  }catch(err){ console.error('ERROR', err); }
})();
