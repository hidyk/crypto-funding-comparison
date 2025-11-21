#!/usr/bin/env ruby
require 'net/http'
require 'json'
require 'uri'
require 'time'

# 各取引所からファンディングレートを取得するスクリプト

# Hyperliquid API
def fetch_hyperliquid
  puts "Fetching Hyperliquid data..."
  uri = URI('https://api.hyperliquid.xyz/info')
  request = Net::HTTP::Post.new(uri)
  request['Content-Type'] = 'application/json'
  request.body = { type: 'metaAndAssetCtxs' }.to_json

  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
    http.request(request)
  end

  return {} unless response.is_a?(Net::HTTPSuccess)

  data = JSON.parse(response.body)
  normalize_hyperliquid(data)
rescue => e
  puts "Error fetching Hyperliquid: #{e.message}"
  {}
end

def normalize_hyperliquid(data)
  result = {}
  return result unless data && data[0] && data[0]['universe']

  data[0]['universe'].each_with_index do |asset, index|
    ctx = data[1] && data[1][index]
    next unless ctx && ctx['funding']

    result[asset['name']] = {
      'fundingRate' => ctx['funding'].to_f,
      'markPrice' => ctx['markPx'].to_f,
      'volume24h' => (ctx['dayNtlVlm'] || 0).to_f
    }
  end

  result
end

# GRVT API
def fetch_grvt
  puts "Fetching GRVT data..."

  # Step 1: 全銘柄リストを取得
  uri = URI('https://market-data.grvt.io/full/v1/instruments')
  request = Net::HTTP::Post.new(uri)
  request['Content-Type'] = 'application/json'
  request.body = {
    kind: ['PERPETUAL'],
    quote: ['USDT'],
    is_active: true,
    limit: 500
  }.to_json

  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
    http.request(request)
  end

  return {} unless response.is_a?(Net::HTTPSuccess)

  instruments_data = JSON.parse(response.body)
  instruments = instruments_data['result'] || []
  result = {}

  # Step 2: 各銘柄のティッカー情報を取得
  instruments.each do |instrument|
    begin
      ticker_uri = URI('https://market-data.grvt.io/full/v1/ticker')
      ticker_request = Net::HTTP::Post.new(ticker_uri)
      ticker_request['Content-Type'] = 'application/json'
      ticker_request.body = { instrument: instrument['instrument'] }.to_json

      ticker_response = Net::HTTP.start(ticker_uri.hostname, ticker_uri.port, use_ssl: true) do |http|
        http.request(ticker_request)
      end

      next unless ticker_response.is_a?(Net::HTTPSuccess)

      ticker_data = JSON.parse(ticker_response.body)
      ticker_result = ticker_data['result'] || ticker_data

      base_symbol = instrument['base'] || instrument['instrument'].gsub('_USDT_Perp', '')

      # funding_rate_8h_curr は8時間レートなので、1時間レートに変換 (/8)
      funding_rate_8h = (ticker_result['funding_rate_8h_curr'] || 0).to_f
      funding_rate_1h = funding_rate_8h / 8.0

      buy_volume = (ticker_result['buy_volume_24h_q'] || 0).to_f
      sell_volume = (ticker_result['sell_volume_24h_q'] || 0).to_f
      volume_24h = buy_volume + sell_volume

      result[base_symbol] = {
        'fundingRate' => funding_rate_1h,
        'markPrice' => (ticker_result['mark_price'] || 0).to_f,
        'volume24h' => volume_24h
      }
    rescue => e
      puts "Error fetching GRVT ticker for #{instrument['instrument']}: #{e.message}"
    end
  end

  result
rescue => e
  puts "Error fetching GRVT: #{e.message}"
  {}
end

# Lighter API
def fetch_lighter
  puts "Fetching Lighter data..."
  uri = URI('https://mainnet.zklighter.elliot.ai/api/v1/funding-rates')
  request = Net::HTTP::Get.new(uri)
  request['Content-Type'] = 'application/json'
  request['Accept'] = 'application/json'

  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
    http.request(request)
  end

  return {} unless response.is_a?(Net::HTTPSuccess)

  data = JSON.parse(response.body)
  normalize_lighter(data)
rescue => e
  puts "Error fetching Lighter: #{e.message}"
  {}
end

def normalize_lighter(data)
  result = {}

  # データが配列の場合
  data_array = data
  if data.is_a?(Hash)
    data_array = data['data'] || data['results'] || data['funding_rates'] || []
  end

  return result unless data_array.is_a?(Array)

  data_array.each do |item|
    symbol = item['symbol'] || item['market'] || item['pair'] || item['orderBookId'] || item['order_book_id']
    next unless symbol

    # シンボルを正規化 (BTC_USDC_PERP -> BTC)
    base_symbol = symbol.split('_')[0].split('-')[0]

    result[base_symbol] = {
      'fundingRate' => (item['funding_rate'] || item['fundingRate'] || item['rate'] || 0).to_f,
      'markPrice' => (item['mark_price'] || item['markPrice'] || item['price'] || 0).to_f,
      'volume24h' => (item['volume_24h'] || item['volume'] || item['quote_volume'] || 0).to_f
    }
  end

  result
end

# EdgeX API
def fetch_edgex
  puts "Fetching EdgeX data..."
  result = {}

  # Step 1: メタデータを取得して全コントラクトを取得
  uri = URI('https://pro.edgex.exchange/api/v1/public/meta/getMetaData')
  request = Net::HTTP::Get.new(uri)
  request['Content-Type'] = 'application/json'
  request['Accept'] = 'application/json'

  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
    http.request(request)
  end

  return {} unless response.is_a?(Net::HTTPSuccess)

  meta_data = JSON.parse(response.body)
  contract_list = meta_data.dig('data', 'contractList') || []

  # Step 2: 全コントラクトのファンディングレートを取得
  contract_list.each do |contract|
    begin
      contract_id = contract['contractId']
      funding_url = "https://pro.edgex.exchange/api/v1/public/funding/getLatestFundingRate?contractId=#{contract_id}"
      funding_uri = URI.parse(funding_url)
      funding_request = Net::HTTP::Get.new(funding_uri.request_uri)
      funding_request['Content-Type'] = 'application/json'
      funding_request['Accept'] = 'application/json'

      funding_response = Net::HTTP.start(funding_uri.hostname, funding_uri.port, use_ssl: true) do |http|
        http.request(funding_request)
      end

      next unless funding_response.is_a?(Net::HTTPSuccess)

      funding_data = JSON.parse(funding_response.body)

      # dataは配列なので、最初の要素を取得
      data_array = funding_data['data']
      if data_array && data_array.is_a?(Array) && !data_array.empty?
        data = data_array[0]

        # シンボルを正規化 (BTCUSDT -> BTC, BTCUSDTPERP -> BTC)
        base_symbol = contract['contractName'].gsub(/USDT?$/, '').gsub(/PERP$/, '')

        result[base_symbol] = {
          'fundingRate' => (data['fundingRate'] || 0).to_f,
          'markPrice' => (data['indexPrice'] || data['oraclePrice'] || 0).to_f,
          'volume24h' => 0.0 # EdgeX doesn't provide volume in funding endpoint
        }
      end
    rescue => e
      puts "Error fetching EdgeX funding for #{contract['contractName']}: #{e.message}"
    end
  end

  result
rescue => e
  puts "Error fetching EdgeX: #{e.message}"
  {}
end

# Paradex API
def fetch_paradex
  puts "Fetching Paradex data..."
  uri = URI('https://api.prod.paradex.trade/v1/markets/summary?market=ALL')
  request = Net::HTTP::Get.new(uri)
  request['Content-Type'] = 'application/json'
  request['Accept'] = 'application/json'

  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
    http.request(request)
  end

  return {} unless response.is_a?(Net::HTTPSuccess)

  data = JSON.parse(response.body)
  normalize_paradex(data)
rescue => e
  puts "Error fetching Paradex: #{e.message}"
  {}
end

def normalize_paradex(data)
  result = {}
  markets = data['results'] || data

  return result unless markets.is_a?(Array)

  markets.each do |market|
    symbol = market['symbol'] || market['market']
    next unless symbol

    # シンボルを正規化 (BTC-USD-PERP -> BTC)
    base_symbol = symbol.split('-')[0]

    result[base_symbol] = {
      'fundingRate' => (market['funding_rate'] || market['fundingRate'] || 0).to_f,
      'markPrice' => (market['mark_price'] || market['markPrice'] || 0).to_f,
      'volume24h' => (market['volume_24h'] || market['quote_volume'] || market['volume'] || 0).to_f
    }
  end

  result
end

# データを統合
def merge_data(exchanges_data)
  merged = {}

  exchanges_data.each do |exchange_name, data|
    data.each do |symbol, info|
      merged[symbol] ||= { 'symbol' => symbol }
      merged[symbol][exchange_name] = info
    end
  end

  # 配列に変換
  merged.values
end

# メイン処理
def main
  puts "Starting funding rates fetch at #{Time.now}"

  # 各取引所からデータを取得
  hyperliquid_data = fetch_hyperliquid
  grvt_data = fetch_grvt
  edgex_data = fetch_edgex
  lighter_data = fetch_lighter
  paradex_data = fetch_paradex

  # データを統合
  merged_data = merge_data({
    'hyperliquid' => hyperliquid_data,
    'grvt' => grvt_data,
    'edgex' => edgex_data,
    'lighter' => lighter_data,
    'paradex' => paradex_data
  })

  # JSONファイルに保存
  output_path = File.join(__dir__, 'data', 'funding-rates.json')
  File.write(output_path, JSON.pretty_generate({
    'data' => merged_data,
    'timestamp' => Time.now.iso8601,
    'exchanges' => ['hyperliquid', 'grvt', 'edgex', 'lighter', 'paradex']
  }))

  puts "Data saved to #{output_path}"
  puts "Total symbols: #{merged_data.length}"
  puts "Finished at #{Time.now}"
end

# スクリプト実行
main if __FILE__ == $PROGRAM_NAME
