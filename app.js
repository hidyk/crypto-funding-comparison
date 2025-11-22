// 取引所の表示名マッピング
const EXCHANGE_NAMES = {
    hyperliquid: 'Hyperliquid',
    grvt: 'Grvt',
    edgex: 'edgeX',
    lighter: 'Lighter',
    paradex: 'Paradex ※'
};

// リファラルリンク（後で実際のリンクに置き換えてください）
const REFERRAL_LINKS = {
    hyperliquid: 'https://hyperliquid.xyz', // TODO: リファラルコードを追加
    grvt: 'https://grvt.io/exchange/sign-up?ref=WLAH21S',
    edgex: 'https://pro.edgex.exchange', // TODO: リファラルコードを追加
    lighter: 'https://lighter.xyz', // TODO: リファラルコードを追加
    paradex: 'https://paradex.trade' // TODO: リファラルコードを追加
};

const ALL_EXCHANGES = ['hyperliquid', 'grvt', 'edgex', 'lighter', 'paradex'];

// グローバル変数
let fundingData = [];
let filteredData = [];
let mainExchange = 'hyperliquid';
let visibleExchanges = new Set(ALL_EXCHANGES);
let currentSort = { column: 'volume', direction: 'desc' }; // デフォルトは取引量の降順
let favorites = new Set(); // お気に入り通貨
let showFavoritesOnly = false; // お気に入りのみ表示フラグ
let dataUpdateTime = null; // データの更新時刻

// localStorage キー
const STORAGE_KEYS = {
    MAIN_EXCHANGE: 'fundingComparison_mainExchange',
    VISIBLE_EXCHANGES: 'fundingComparison_visibleExchanges',
    FAVORITES: 'fundingComparison_favorites',
    SHOW_FAVORITES_ONLY: 'fundingComparison_showFavoritesOnly'
};

// localStorage 保存・読み込み
function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEYS.MAIN_EXCHANGE, mainExchange);
        localStorage.setItem(STORAGE_KEYS.VISIBLE_EXCHANGES, JSON.stringify(Array.from(visibleExchanges)));
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(Array.from(favorites)));
        localStorage.setItem(STORAGE_KEYS.SHOW_FAVORITES_ONLY, showFavoritesOnly.toString());
    } catch (e) {
        console.error('Failed to save settings to localStorage:', e);
    }
}

function loadSettings() {
    try {
        // メイン取引所
        const savedMainExchange = localStorage.getItem(STORAGE_KEYS.MAIN_EXCHANGE);
        if (savedMainExchange && ALL_EXCHANGES.includes(savedMainExchange)) {
            mainExchange = savedMainExchange;
            document.getElementById('main-exchange').value = mainExchange;
        }

        // 表示する取引所
        const savedVisibleExchanges = localStorage.getItem(STORAGE_KEYS.VISIBLE_EXCHANGES);
        if (savedVisibleExchanges) {
            const exchanges = JSON.parse(savedVisibleExchanges);
            visibleExchanges = new Set(exchanges.filter(ex => ALL_EXCHANGES.includes(ex)));

            // チェックボックスを更新
            document.querySelectorAll('.exchange-checkbox').forEach(checkbox => {
                const exchange = checkbox.dataset.exchange;
                checkbox.checked = visibleExchanges.has(exchange);
            });
        }

        // お気に入り
        const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
        if (savedFavorites) {
            favorites = new Set(JSON.parse(savedFavorites));
        }

        // お気に入りのみ表示
        const savedShowFavoritesOnly = localStorage.getItem(STORAGE_KEYS.SHOW_FAVORITES_ONLY);
        if (savedShowFavoritesOnly) {
            showFavoritesOnly = savedShowFavoritesOnly === 'true';
            const checkbox = document.getElementById('favorites-only');
            if (checkbox) {
                checkbox.checked = showFavoritesOnly;
            }
        }
    } catch (e) {
        console.error('Failed to load settings from localStorage:', e);
    }
}

function resetSettings() {
    if (confirm('Are you sure you want to reset all settings? This will clear your favorites and preferences.')) {
        try {
            localStorage.removeItem(STORAGE_KEYS.MAIN_EXCHANGE);
            localStorage.removeItem(STORAGE_KEYS.VISIBLE_EXCHANGES);
            localStorage.removeItem(STORAGE_KEYS.FAVORITES);
            localStorage.removeItem(STORAGE_KEYS.SHOW_FAVORITES_ONLY);

            // デフォルト値にリセット
            mainExchange = 'hyperliquid';
            visibleExchanges = new Set(ALL_EXCHANGES);
            favorites = new Set();
            showFavoritesOnly = false;

            // UIを更新
            document.getElementById('main-exchange').value = mainExchange;
            document.querySelectorAll('.exchange-checkbox').forEach(checkbox => {
                checkbox.checked = true;
            });
            const favCheckbox = document.getElementById('favorites-only');
            if (favCheckbox) {
                favCheckbox.checked = false;
            }

            updateExchangeCheckboxes();
            filterAndRender();

            alert('Settings have been reset successfully!');
        } catch (e) {
            console.error('Failed to reset settings:', e);
        }
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    loadSettings(); // 設定を読み込み
    updateExchangeCheckboxes(); // チェックボックスの初期状態を設定
    loadData();
    setupEventListeners();

    // 1時間ごとに自動更新
    setInterval(loadData, 60 * 60 * 1000);
});

// イベントリスナー設定
function setupEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', loadData);
    document.getElementById('search').addEventListener('input', filterAndRender);
    document.getElementById('main-exchange').addEventListener('change', (e) => {
        mainExchange = e.target.value;
        updateExchangeCheckboxes(); // チェックボックスを更新

        // 差額を再計算
        recalculateSpreadAndDiffs(fundingData);

        saveSettings(); // 設定を保存
        filterAndRender();
    });

    // 各取引所のチェックボックス
    document.querySelectorAll('.exchange-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const exchange = e.target.dataset.exchange;
            if (e.target.checked) {
                visibleExchanges.add(exchange);
            } else {
                visibleExchanges.delete(exchange);
            }
            saveSettings(); // 設定を保存
            filterAndRender();
        });
    });

    // お気に入りのみ表示チェックボックス
    const favoritesOnlyCheckbox = document.getElementById('favorites-only');
    if (favoritesOnlyCheckbox) {
        favoritesOnlyCheckbox.addEventListener('change', (e) => {
            showFavoritesOnly = e.target.checked;
            saveSettings(); // 設定を保存
            filterAndRender();
        });
    }

    // リセットボタン
    const resetBtn = document.getElementById('reset-settings-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetSettings);
    }
}

// お気に入りのトグル
function toggleFavorite(symbol) {
    if (favorites.has(symbol)) {
        favorites.delete(symbol);
    } else {
        favorites.add(symbol);
    }
    saveSettings(); // 設定を保存
    filterAndRender();
}

// チェックボックスの表示/非表示を更新
function updateExchangeCheckboxes() {
    // すべてのチェックボックスを取得
    document.querySelectorAll('.exchange-checkbox').forEach(checkbox => {
        const exchange = checkbox.dataset.exchange;
        const label = checkbox.closest('.checkbox-label');

        if (exchange === mainExchange) {
            // メイン取引所のチェックボックスを非表示
            label.style.display = 'none';
            // メイン取引所は常にvisibleExchangesに含める
            visibleExchanges.add(exchange);
        } else {
            // その他の取引所は表示
            label.style.display = 'flex';
        }
    });
}

// データ読み込み
async function loadData() {
    showLoading(true);
    hideError();

    try {
        // JSONファイルからデータを読み込む
        const response = await fetch('data/funding-rates.json');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const jsonData = await response.json();
        console.log('Loaded JSON data:', jsonData);

        // データを統合
        fundingData = jsonData.data || [];
        dataUpdateTime = jsonData.timestamp || null; // 更新時刻を保存

        // 差額を計算
        recalculateSpreadAndDiffs(fundingData);

        console.log('Merged funding data:', fundingData);

        // 表示
        filterAndRender();
        updateLastUpdateTime();
        showLoading(false);

    } catch (error) {
        console.error('データ取得エラー:', error);
        showError();
        showLoading(false);
    }
}


// 最大差額とメイン取引所との差額を再計算する関数
function recalculateSpreadAndDiffs(dataArray) {
    dataArray.forEach(item => {
        // 最大差額を計算（全取引所）
        const rates = [];
        ALL_EXCHANGES.forEach(ex => {
            if (item[ex] && item[ex].fundingRate !== undefined) {
                rates.push(item[ex].fundingRate);
            }
        });

        if (rates.length >= 2) {
            const max = Math.max(...rates);
            const min = Math.min(...rates);
            item.maxSpread = max - min;
        } else {
            item.maxSpread = 0;
        }

        // 古い差額フィールドをクリア
        ALL_EXCHANGES.forEach(ex => {
            delete item[`${ex}_diff`];
        });

        // メイン取引所との差額を計算
        const mainRate = item[mainExchange]?.fundingRate;
        if (mainRate !== undefined) {
            ALL_EXCHANGES.forEach(ex => {
                if (ex !== mainExchange && item[ex] && item[ex].fundingRate !== undefined) {
                    item[`${ex}_diff`] = item[ex].fundingRate - mainRate;
                }
            });
        }
    });
}

// フィルタリングとレンダリング
function filterAndRender() {
    const searchTerm = document.getElementById('search').value.toLowerCase();

    // フィルタリング
    filteredData = fundingData.filter(item => {
        // 検索条件でフィルタ
        if (!item.symbol.toLowerCase().includes(searchTerm)) {
            return false;
        }

        // メイン取引所のデータが存在するかチェック
        // メイン取引所でN/Aの銘柄は表示しない（差額計算ができないため）
        if (!item[mainExchange] || item[mainExchange].fundingRate === undefined) {
            return false;
        }

        // お気に入りのみ表示フィルター
        if (showFavoritesOnly && !favorites.has(item.symbol)) {
            return false;
        }

        return true;
    });

    // ソート
    sortData();

    renderTableHeader();
    renderTableBody();
}

// データをソート
function sortData() {
    filteredData.sort((a, b) => {
        let aVal, bVal;

        // ソート対象の値を取得
        switch (currentSort.column) {
            case 'symbol':
                return currentSort.direction === 'asc'
                    ? a.symbol.localeCompare(b.symbol)
                    : b.symbol.localeCompare(a.symbol);

            case 'mainFR':
                aVal = a[mainExchange]?.fundingRate || 0;
                bVal = b[mainExchange]?.fundingRate || 0;
                break;

            case 'volume':
                aVal = a[mainExchange]?.volume24h || 0;
                bVal = b[mainExchange]?.volume24h || 0;
                break;

            case 'maxSpread':
                aVal = a.maxSpread || 0;
                bVal = b.maxSpread || 0;
                break;

            default:
                // 取引所別FR or 差額
                if (currentSort.column.endsWith('_fr')) {
                    const ex = currentSort.column.replace('_fr', '');
                    aVal = a[ex]?.fundingRate || 0;
                    bVal = b[ex]?.fundingRate || 0;
                } else if (currentSort.column.endsWith('_diff')) {
                    aVal = a[currentSort.column] || 0;
                    bVal = b[currentSort.column] || 0;
                } else {
                    return 0;
                }
        }

        return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
}

// ソート方向を切り替え
function toggleSort(column) {
    if (currentSort.column === column) {
        // 同じカラムをクリックした場合は方向を反転
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // 異なるカラムをクリックした場合は降順から開始
        currentSort.column = column;
        currentSort.direction = 'desc';
    }

    filterAndRender();
}

// テーブルヘッダー描画
function renderTableHeader() {
    const thead = document.getElementById('table-header');
    const visibleExList = Array.from(visibleExchanges);

    let headerHTML = '';

    // 銘柄カラム
    headerHTML += createSortableHeader('symbol', 'Symbol', 'sticky-col');

    // メイン取引所を最初に表示
    if (visibleExchanges.has(mainExchange)) {
        headerHTML += createSortableHeader('mainFR', `${EXCHANGE_NAMES[mainExchange]} (Main)`, 'main-exchange-col', REFERRAL_LINKS[mainExchange]);
        headerHTML += createSortableHeader('volume', '24h Volume', 'volume-col');
    }

    // その他の取引所を表示
    visibleExList.forEach(ex => {
        if (ex !== mainExchange) {
            headerHTML += createSortableHeader(`${ex}_fr`, EXCHANGE_NAMES[ex], '', REFERRAL_LINKS[ex]);
            headerHTML += createSortableHeader(`${ex}_diff`, `vs ${EXCHANGE_NAMES[mainExchange]}`, 'diff-col');
        }
    });

    // 最大差額
    headerHTML += createSortableHeader('maxSpread', 'Max Spread', 'highlight-col');

    thead.innerHTML = headerHTML;

    // ヘッダーにクリックイベントを追加
    thead.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.column;
            toggleSort(column);
        });
    });
}

// ソート可能なヘッダーを作成
function createSortableHeader(column, label, className = '', referralLink = null) {
    const isActive = currentSort.column === column;
    const direction = isActive ? currentSort.direction : 'desc';
    const arrow = direction === 'asc' ? ' ↑' : ' ↓';
    const arrowClass = isActive ? '' : 'sort-arrow-inactive';

    // リファラルリンクのアイコンを追加
    const refIcon = referralLink
        ? `<a href="${referralLink}" class="ref-icon" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="Sign up on ${label}">🔗</a>`
        : '';

    return `<th class="sortable ${className} ${isActive ? 'sort-active' : ''}" data-column="${column}">
        <div class="header-content">
            <span class="exchange-name">${label}${refIcon}</span>
            <span class="${arrowClass}">${arrow}</span>
        </div>
    </th>`;
}

// テーブルボディ描画
function renderTableBody() {
    const tbody = document.getElementById('table-body');
    const visibleExList = Array.from(visibleExchanges);

    if (filteredData.length === 0) {
        const colspan = 3 + (visibleExList.length - 1) * 2; // ボリュームカラム追加で+1
        const message = showFavoritesOnly && favorites.size === 0
            ? 'No favorites added yet. Click ☆ to add favorites!'
            : 'No data available';
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" style="text-align: center; padding: 40px; color: #666;">
                    ${message}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredData.map(item => {
        const isFavorite = favorites.has(item.symbol);
        const starIcon = isFavorite ? '⭐' : '☆';

        let rowHTML = `<td class="sticky-col">
            <button class="favorite-btn" onclick="toggleFavorite('${item.symbol}')" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                ${starIcon}
            </button>
            <span class="symbol-text">${item.symbol}</span>
        </td>`;

        // メイン取引所
        if (visibleExchanges.has(mainExchange)) {
            const mainRate = item[mainExchange]?.fundingRate;
            const volume = item[mainExchange]?.volume24h;
            rowHTML += `<td class="main-exchange-col">${formatFundingRate(mainRate)}</td>`;
            rowHTML += `<td class="volume-col">${formatVolume(volume)}</td>`;
        }

        // その他の取引所
        visibleExList.forEach(ex => {
            if (ex !== mainExchange) {
                const rate = item[ex]?.fundingRate;
                const diff = item[`${ex}_diff`];
                rowHTML += `<td>${formatFundingRate(rate)}</td>`;
                rowHTML += `<td class="diff-col">${formatDiff(diff)}</td>`;
            }
        });

        // 最大差額
        rowHTML += `<td class="highlight-col">${formatSpread(item.maxSpread)}</td>`;

        return `<tr>${rowHTML}</tr>`;
    }).join('');
}

// ファンディングレートのフォーマット
function formatFundingRate(rate) {
    if (rate === undefined || rate === null) {
        return '<span class="na">N/A</span>';
    }

    const percentage = (rate * 100).toFixed(4);
    const className = rate > 0 ? 'positive' : rate < 0 ? 'negative' : 'neutral';

    return `<span class="fr-value ${className}">${percentage}%</span>`;
}

// 差額のフォーマット
function formatDiff(diff) {
    if (diff === undefined || diff === null) {
        return '<span class="na">-</span>';
    }

    const percentage = (diff * 100).toFixed(4);
    const sign = diff > 0 ? '+' : '';
    const className = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';

    return `<span class="fr-value ${className}">${sign}${percentage}%</span>`;
}

// 最大差額のフォーマット
function formatSpread(spread) {
    if (!spread || spread === 0) {
        return '<span class="na">-</span>';
    }

    const percentage = (spread * 100).toFixed(4);
    const className = spread > 0.01 ? 'spread-high' : 'spread-low';

    return `<span class="spread-value ${className}">${percentage}%</span>`;
}

// 取引量のフォーマット
function formatVolume(volume) {
    if (volume === undefined || volume === null || volume === 0) {
        return '<span class="na">-</span>';
    }

    // ドル表記に変換
    let formatted;
    if (volume >= 1e9) {
        formatted = `$${(volume / 1e9).toFixed(2)}B`;
    } else if (volume >= 1e6) {
        formatted = `$${(volume / 1e6).toFixed(2)}M`;
    } else if (volume >= 1e3) {
        formatted = `$${(volume / 1e3).toFixed(2)}K`;
    } else {
        formatted = `$${volume.toFixed(2)}`;
    }

    return `<span class="volume-value">${formatted}</span>`;
}

// 最終更新時刻の表示
function updateLastUpdateTime() {
    if (!dataUpdateTime) {
        document.getElementById('last-update').textContent = '-';
        return;
    }

    const updateDate = new Date(dataUpdateTime);

    // UTC時刻（HH:MM:SS形式）
    const utcTime = updateDate.toISOString().slice(11, 19);

    // ローカル時刻（HH:MM:SS形式）
    const localTime = updateDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    // UTCメイン、ローカルをカッコ内に表示
    const timeString = `${utcTime} UTC (${localTime} Local)`;

    document.getElementById('last-update').textContent = timeString;
}

// ローディング表示
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.querySelector('.table-wrapper').style.opacity = show ? '0.5' : '1';
}

// エラー表示
function showError() {
    document.getElementById('error').style.display = 'block';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}
