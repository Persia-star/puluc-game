let state; let socket; let botThinking = false;
const $ = id => document.getElementById(id);
const board = $('board');
const savedTheme = localStorage.getItem('puluc-theme') || 'temple';
document.body.dataset.theme = savedTheme;
$('theme').value = savedTheme;
function connect() {
  const gameId = localStorage.getItem('puluc-game');
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${gameId ? `?gameId=${encodeURIComponent(gameId)}` : ''}`);
  socket.onopen = () => { $('connection').innerHTML = '<span class="online-dot"></span>ONLINE'; $('connection').className = 'connection online'; };
  socket.onclose = () => { $('connection').textContent = 'Reconnecting…'; $('connection').className = 'status'; setTimeout(connect, 1000); };
  socket.onmessage = message => {
    const packet = JSON.parse(message.data);
    if (packet.type === 'game:state') { state = packet.payload.state; localStorage.setItem('puluc-game', state.gameId); render(); }
    if (packet.type === 'bot:thinking') { botThinking = packet.payload.active; render(); }
    if (packet.type === 'game:error') { state = packet.payload.snapshot; toast(packet.payload.message); render(); }
    if (packet.type === 'game:ended') showResult(packet.payload);
  };
}
function command(type, extra = {}) { if (!state || socket.readyState !== 1) return; socket.send(JSON.stringify({ type, gameId: state.gameId, commandId: crypto.randomUUID(), expectedVersion: state.version, ...extra })); }
function sourceKey(move) { return move.source.type === 'reserve' ? 'reserve' : String(move.source.index); }
function render() {
  if (!state) return;
  $('difficulty').value = state.difficulty; $('pieceCount').value = state.piecesPerPlayer;
  $('turnBanner').textContent = state.phase === 'PAUSED' ? 'Game paused' : state.result ? 'Journey complete' : `${state.currentPlayer === 'human' ? 'Your' : 'Bot'} turn · ${state.phase.replaceAll('_', ' ').toLowerCase()}`;
  $('botStatus').textContent = botThinking ? 'Studying the path…' : state.currentPlayer === 'bot' ? 'Preparing a cast' : 'Watching';
  $('humanCounts').innerHTML = renderPips('human');
  $('botCounts').innerHTML = renderPips('bot');
  $('sticks').innerHTML = state.currentRoll ? state.currentRoll.sticks.map(on => `<span class="stick ${on ? 'painted' : ''}" aria-label="${on ? 'painted' : 'blank'}">${on ? '◆' : '•'}</span>`).join('') + `<b>${state.currentRoll.value}</b>` : Array.from({ length: 4 }, () => '<span class="stick dormant" aria-hidden="true">•</span>').join('');
  board.innerHTML = '';
  for (let index = 10; index >= 0; index--) {
    const stack = state.stacks.find(item => item.position === index); const moves = state.legalMoves.filter(move => move.source.type === 'board' && move.source.index === index);
    const cell = document.createElement('button'); cell.className = `cell ${index === 0 || index === 10 ? 'base' : ''} ${moves.length ? 'legal' : ''}`; cell.disabled = !moves.length;
    if (stack) {
      const controller = stack.piecesBottomToTop.at(-1).owner;
      const layers = stack.piecesBottomToTop.map(piece => `<i class="layer ${piece.owner}" title="${piece.owner}"></i>`).join('');
      cell.innerHTML = `<span class="index">${index}</span><span class="stack"><i class="guardian ${controller}" aria-hidden="true"><img src="/assets/${controller === 'human' ? 'jade' : 'ember'}-guardian.png" alt=""></i><span class="controller-mark">${controller === 'human' ? 'J' : 'K'}</span></i><span class="layers">${layers}</span>${stack.piecesBottomToTop.length > 1 ? `<em>${stack.piecesBottomToTop.length}</em>` : ''}</span>`;
    } else cell.innerHTML = `<span class="index">${index}</span><span class="rune"><b>${['✦','◈','⌁','◇'][index % 4]}</b></span>`;
    cell.setAttribute('aria-label', `Space ${index}${stack ? `, stack of ${stack.piecesBottomToTop.length}` : ', empty'}`); cell.onclick = () => command('game:move', { move: moves[0] }); board.append(cell);
  }
  const reserveMove = state.legalMoves.find(move => sourceKey(move) === 'reserve');
  $('roll').innerHTML = reserveMove ? '<span class="roll-icon">♟</span><span>DEPLOY</span>' : state.phase === 'SELECTING_MOVE' ? '<span class="roll-icon">◆</span><span>SELECT</span>' : state.currentPlayer === 'bot' ? '<span class="roll-icon">⌛</span><span>WAIT</span>' : '<span class="roll-icon">▯</span><span>ROLL</span>';
  $('roll').disabled = state.phase !== 'ROLLING' && !reserveMove;
  $('roll').onclick = () => reserveMove ? command('game:move', { move: reserveMove }) : command('game:roll');
  $('pause').textContent = state.phase === 'PAUSED' ? 'Resume' : 'Pause'; $('pause').onclick = () => command(state.phase === 'PAUSED' ? 'game:resumePlay' : 'game:pause');
  $('history').innerHTML = [...state.history].slice(-30).reverse().map(item => `<p><time>v${item.version}</time>${escapeHtml(item.message)}</p>`).join('');
  if (state.result) showResult(state.result);
}
function renderPips(player) { const alive = state.piecesPerPlayer - state.eliminated[player].length; return Array.from({ length: state.piecesPerPlayer }, (_, index) => `<i class="pip ${index < alive ? `alive ${player}` : ''}" title="${alive} pieces alive"></i>`).join(''); }
function restart() { command('game:restart', { piecesPerPlayer: Number($('pieceCount').value), difficulty: $('difficulty').value }); $('resultDialog').close(); }
function showResult(result) { $('resultTitle').textContent = result.draw ? 'The path rests' : result.winner === 'human' ? 'Victory' : 'The guardian prevails'; $('resultReason').textContent = result.reason; if (!$('resultDialog').open) $('resultDialog').showModal(); }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 2600); }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
$('theme').onchange = event => { const theme = event.target.value; document.body.dataset.theme = theme; localStorage.setItem('puluc-theme', theme); };
document.querySelectorAll('.guide-tab').forEach(tab => tab.onclick = () => {
  document.querySelectorAll('.guide-tab').forEach(item => item.classList.toggle('active', item === tab));
  document.querySelectorAll('.guide-page').forEach(page => page.classList.toggle('active', page.dataset.guidePage === tab.dataset.guideLang));
});
$('settings').onclick = () => document.querySelector('.side-panel').classList.toggle('open'); $('closePanel').onclick = () => document.querySelector('.side-panel').classList.remove('open'); $('rules').onclick = () => $('rulesDialog').showModal(); document.querySelector('.close').onclick = () => $('rulesDialog').close(); $('restart').onclick = () => confirm('Restart this journey?') && restart(); $('rematch').onclick = restart; connect();
