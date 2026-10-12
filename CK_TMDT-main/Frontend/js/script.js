const titles = {
  s33:'PROVIDER / ĐỀ XUẤT CÔNG VIỆC (UC-33)',
  s34:'PROVIDER / XEM YÊU CẦU THUÊ (UC-34)',
  s35:'PROVIDER / ỨNG TUYỂN (UC-35)',
  s36:'PROVIDER / THEO DÕI ỨNG TUYỂN (UC-36)',
  s37:'PROVIDER / BOOKING (UC-37)',
  s38:'PROVIDER / ORDER (UC-38)',
  s39:'PROVIDER / TIẾN ĐỘ CÔNG VIỆC (UC-39)',
  s40:'PROVIDER / HOÀN TẤT CÔNG VIỆC (UC-40)',
};
function go(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const navBtn = document.querySelector('.nav-item[data-screen="'+id+'"]');
  if(navBtn) navBtn.classList.add('active');
  document.getElementById('crumb').textContent = titles[id];
  window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item[data-screen]').forEach(btn=>{
  btn.addEventListener('click', ()=>go(btn.dataset.screen));
});
function showDone(){ document.getElementById('doneMsg').style.display='block'; }