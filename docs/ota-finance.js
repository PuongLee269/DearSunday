(function(){
  'use strict';
  var names={airbnb:'Airbnb',booking:'Booking.com',agoda:'Agoda'},rows=[],config={},busy=false,last=0,selected=null;
  var box=document.createElement('details');box.className='panel fold';box.id='otaFinance';box.open=true;
  box.innerHTML='<summary><div class="st"><h3>Tài chính từ nền tảng</h3></div></summary><div class="fold-body"><div class="bar"><p id="otaStatus" role="status" class="muted"></p><button type="button" class="btn ghost sm" id="otaRefresh">Cập nhật dự kiến</button></div><details class="more"><summary>Cách tính tạm</summary><p class="muted">Tạm tính theo ngày lưu trú × giá gói qua đêm trong app, trừ chiết khấu do Admin nhập. Không phải giá đơn chính thức từ nền tảng. Ngày iCal có thể chỉ là ngày khóa hoặc lịch đồng bộ chéo; chỉ xác nhận thu cho đơn khách đặt thật.</p></details><div id="otaRows" class="list"></div><div class="inner stack" id="otaReceipt" hidden></div><details class="more"><summary>Thêm đơn nền tảng chưa có trong lịch (bao gồm Agoda)</summary><p class="muted">Chỉ thêm mục tính tiền, không thay đổi lịch phòng. Agoda chưa được app đọc trực tiếp.</p><form id="otaAddForm" class="stack"><label class="f">Nền tảng<select id="otaSource"><option value="agoda">Agoda</option><option value="airbnb">Airbnb</option><option value="booking">Booking.com</option></select></label><label class="f">Mã đặt phòng<input id="otaReference" maxlength="100" required></label><label class="f">Ngày nhận<input id="otaStart" type="date" required></label><label class="f">Ngày trả<input id="otaEnd" type="date" required></label><button class="btn" type="submit">Thêm để tính tiền</button></form></details></div>';
  document.querySelector('#fin > .stack').insertBefore(box,document.getElementById('finTable'));
  var settings=document.createElement('details');settings.className='panel fold';settings.id='otaSettings';
  settings.innerHTML='<summary><h3>Chiết khấu và giá tính tiền nền tảng</h3></summary><div class="fold-body"><p class="muted">Chỉ Admin được sửa chiết khấu. Để trống nghĩa là chưa cấu hình; 0% phải nhập rõ. Giá dùng từ “Giá các gói” ở trên. Ngày trả không tính thêm đêm. Dự kiến chưa gồm khuyến mãi, phụ thu hoặc thuế riêng trên nền tảng; kiểm tra trước khi xác nhận tiền thực nhận.</p><form id="otaConfigForm" class="stack"><div id="otaConfigFields" class="stack"></div><button class="btn" type="submit">Lưu cấu hình tính tiền</button><p id="otaConfigStatus" role="status"></p></form></div>';
  document.querySelector('#settings > .stack').insertBefore(settings,document.getElementById('grpConn'));
  function status(t){document.getElementById('otaStatus').textContent=t;}
  function srcName(k){return Object.prototype.hasOwnProperty.call(names,k)?names[k]:'Nền tảng';}
  function pkgName(k){return GOI_BY[k]?GOI_BY[k].ten:'gói';}
  function checked(r){if(!r||!r.ok)throw new Error(r&&r.error||'Không thực hiện được');return r;}
  function quoteText(r){var q=r.receipt?r.receipt.quote:r.quote;if(!q||q.error)return '<span class="pill warn">'+esc(q&&q.error||'Chưa tính được')+'</span>';
    return '<div>'+q.nights+' đêm × '+money(q.nightly)+' ('+esc(pkgName(q.pkg))+') = '+money(q.gross)+'</div><div>Chiết khấu '+q.percent+'%: '+money(q.fee)+' · <b>Dự kiến nhận: '+money(q.net)+'</b></div>';}
  function render(){
    document.getElementById('otaRows').innerHTML=rows.length?rows.slice().sort(function(a,b){return a.start<b.start?-1:1;}).map(function(r){
      return '<div class="li otr"><b>'+esc(srcName(r.source))+' · '+esc(r.start)+' → '+esc(r.end)+'</b>'+(r.reference?'<div>Mã đơn: '+esc(r.reference)+'</div>':'')+quoteText(r)+(r.receipt?'<div class="pill good">Đã nhận '+money(r.receipt.amount)+' · '+esc(r.receipt.receivedOn)+'</div>'+(A.role==='admin'?' <button type="button" class="btn ghost sm" data-ota-cancel="'+esc(r.id)+'">Hủy xác nhận</button>':''):'<p class="muted">'+(r.origin==='ical'?'Chờ đối chiếu đơn thật':'Đơn thêm thủ công')+(!r.inCalendar&&r.origin==='ical'?' · Không còn trong lịch hiện tại':'')+'</p><button type="button" class="btn sm" data-ota-receive="'+esc(r.id)+'"'+(r.quote.error?' disabled':'')+'>Xác nhận đã nhận tiền</button>')+'</div>';
    }).join(''):'<p class="muted">Chưa có mục tính tiền từ nền tảng.</p>';
    if(!settings.contains(document.activeElement))document.getElementById('otaConfigFields').innerHTML=Object.keys(names).map(function(src){var c=config[src]||{};return '<div class="inner stack"><b>'+names[src]+'</b><label class="f">Chiết khấu (%)<input type="number" min="0" max="100" step="0.01" data-ota-percent="'+src+'" value="'+(typeof c.percent==='number'?c.percent:'')+'" placeholder="Chưa cấu hình"></label><label class="f">Gói dùng làm giá mỗi đêm<select data-ota-pkg="'+src+'"><option value="sunday"'+(c.pkg!=='night'?' selected':'')+'>Sunday Night</option><option value="night"'+(c.pkg==='night'?' selected':'')+'>Night Only</option></select></label></div>';}).join('');
  }
  async function refresh(force){
    if(MODE!=='cloud'||busy||(!force&&Date.now()-last<15000))return;
    busy=true;
    try{var r=checked(await api('otaInfo',{}));rows=r.rows;config=r.config;last=Date.now();status('Khoản dự kiến chỉ vào Đã thu sau khi xác nhận.');render();}
    catch(e){status(e.message);}finally{busy=false;}
  }
  async function syncFirst(){if(isDirty())await push();if(isDirty())throw new Error('Cần đồng bộ xong dữ liệu trước khi ghi nhận tiền');}
  async function action(name,payload){await syncFirst();checked(await api(name,payload));await pull();last=0;await refresh(true);}
  // Admin: gỡ xác nhận thu của một mục đối soát. Máy chủ cũ chưa có action này thì báo nhẹ, không vỡ trang.
  function needUpdate(r){return !!r&&(r.code==='missing'||/Không rõ yêu cầu|unknown action|thiếu phần/i.test(String(r.error||'')));}
  async function cancelReceipt(id){
    await syncFirst();
    var r=await api('otaCancel',{id:id});
    if(!r||!r.ok){if(needUpdate(r))throw new Error('Cần cập nhật máy chủ để dùng chức năng này');throw new Error(r&&r.error||'Không thực hiện được');}
    await pull();last=0;await refresh(true);
  }
  box.addEventListener('click',async function(e){
    var cb=e.target.closest('[data-ota-cancel]');
    if(cb){
      if(A.role!=='admin')return;
      if(!confirm('Hủy xác nhận khoản đã nhận tiền này? Khoản thu tương ứng trong Tài chính sẽ được gỡ.'))return;
      cb.disabled=true;
      try{await cancelReceipt(cb.dataset.otaCancel);renderFin();bao('Đã hủy xác nhận');}
      catch(err){status(err.message);bao(err.message);cb.disabled=false;}
      return;
    }
  });
  box.addEventListener('click',function(e){var b=e.target.closest('[data-ota-receive]');if(!b)return;
    selected=rows.filter(function(r){return r.id===b.dataset.otaReceive;})[0];if(!selected||selected.receipt)return;
    var r=selected,panel=document.getElementById('otaReceipt');panel.hidden=false;
    panel.innerHTML='<h3>Xác nhận khoản đã nhận</h3><p><b>'+esc(srcName(r.source))+' · '+esc(r.start)+' → '+esc(r.end)+'</b></p>'+quoteText(r)+'<form id="otaReceiptForm" class="stack"><label class="f">Mã đặt phòng<input id="otaReceiveReference" maxlength="100" required value="'+esc(r.reference||'')+'"></label><label class="f">Số tiền thực nhận sau phí (đ)<input id="otaActual" type="number" min="1" max="1000000000" step="1" required value="'+r.quote.net+'"></label><label class="f">Ngày đã nhận tiền<input id="otaReceivedOn" type="date" max="'+today()+'" required value="'+today()+'"></label><label><input id="otaReal" type="checkbox" required> Tôi đã đối chiếu đây là đơn khách đặt thật, không phải ngày khóa hoặc đơn trùng từ nền tảng khác.</label><label><input id="otaReceived" type="checkbox" required> Tôi xác nhận đã nhận số tiền trên và chưa ghi khoản thu này trước đó.</label><div class="bar"><button class="btn" type="submit">Xác nhận và ghi vào Tài chính</button><button class="btn ghost" type="button" id="otaCancel">Hủy</button></div><p id="otaReceiveStatus" role="status"></p></form>';
    document.getElementById('otaCancel').onclick=function(){panel.hidden=true;selected=null;};
    document.getElementById('otaReceiptForm').onsubmit=async function(ev){ev.preventDefault();var btn=this.querySelector('button[type=submit]');btn.disabled=true;var q=r.quote;
      try{await action('otaReceive',{id:r.id,expectedNet:q.net,expectedNightly:q.nightly,expectedPercent:q.percent,expectedPkg:q.pkg,actualAmount:+document.getElementById('otaActual').value,receivedOn:document.getElementById('otaReceivedOn').value,reference:document.getElementById('otaReceiveReference').value.trim(),realBooking:document.getElementById('otaReal').checked,confirmed:document.getElementById('otaReceived').checked});panel.hidden=true;selected=null;renderFin();bao('Đã ghi nhận tiền thực nhận vào Tài chính');}
      catch(err){document.getElementById('otaReceiveStatus').textContent=err.message;}finally{btn.disabled=false;}
    };
  });
  document.getElementById('otaConfigForm').onsubmit=async function(e){e.preventDefault();var btn=this.querySelector('button');btn.disabled=true;
    try{var c={};Object.keys(names).forEach(function(src){var v=document.querySelector('[data-ota-percent="'+src+'"]').value;c[src]={percent:v===''?null:Number(v),pkg:document.querySelector('[data-ota-pkg="'+src+'"]').value};});await action('otaSetConfig',{config:c});document.getElementById('otaConfigStatus').textContent='Đã lưu. Các khoản đã xác nhận giữ nguyên số tiền cũ.';}
    catch(err){document.getElementById('otaConfigStatus').textContent=err.message;}finally{btn.disabled=false;}
  };
  document.getElementById('otaAddForm').onsubmit=async function(e){e.preventDefault();var btn=this.querySelector('button');btn.disabled=true;
    try{await action('otaAdd',{source:document.getElementById('otaSource').value,start:document.getElementById('otaStart').value,end:document.getElementById('otaEnd').value,reference:document.getElementById('otaReference').value.trim()});this.reset();status('Đã thêm mục dự kiến, chưa ghi thu và không thay đổi lịch phòng.');}catch(err){status(err.message);}finally{btn.disabled=false;}
  };
  document.getElementById('otaRefresh').onclick=function(){refresh(true);};
  var baseFin=renderFin;renderFin=function(){baseFin();refresh(false);};
  var baseSettings=renderSettings;renderSettings=function(){baseSettings();settings.hidden=MODE!=='cloud'||A.role!=='admin';refresh(false);};
  var baseStart=startCloud;startCloud=function(){baseStart();refresh(true);};
  var baseTake=takeExt;takeExt=function(r){baseTake(r);refresh(false);};
})();
