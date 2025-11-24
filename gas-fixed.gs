// Configuration

const LIVE_DATA_SHEET = 'LiveStreamData';
const PRODUCTION_SHEET_ID = '1YB8LLyeMZPwGwAlPOdd-NoJLxIMiRYLq63u6Fv4nOdo';
const PRODUCTION_STREAM_DATA_TAB = 'StreamData';

function logToSheet(message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('DebugLog');
    if (!logSheet) {
      logSheet = ss.insertSheet('DebugLog');
      logSheet.appendRow(['Timestamp', 'Message']);
    }
    logSheet.appendRow([new Date(), message]);
  } catch (e) {
    // Silent fail
  }
}

function doPost(e) {
  logToSheet('doPost called');
  try {
    const data = JSON.parse(e.postData.contents);
    logToSheet('Parsed data successfully');
    logToSheet('hoursStreamed: ' + data.hoursStreamed);
    logToSheet('hoursStreamed type: ' + typeof data.hoursStreamed);
    logToSheet('grossSales: ' + data.grossSales);
    logToSheet('estimatedOrders: ' + data.estimatedOrders);
    
    if (!data.streamId || data.grossSales === undefined || data.estimatedOrders === undefined) {
      logToSheet('ERROR: Missing required fields');
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Missing required fields'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Append to Bot Collector LiveStreamData
    logToSheet('Calling appendToLiveData...');
    appendToLiveData(data);
    logToSheet('appendToLiveData completed');
    
    // Update Production StreamData if URL match found
    logToSheet('Calling updateProductionStreamData...');
    updateProductionStreamData(data);
    logToSheet('updateProductionStreamData completed');
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    logToSheet('ERROR in doPost: ' + error.toString());
    logToSheet('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function appendToLiveData(data) {
  logToSheet('appendToLiveData START');
  logToSheet('data.hoursStreamed = ' + data.hoursStreamed);
  logToSheet('data.hoursStreamed type = ' + typeof data.hoursStreamed);
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(LIVE_DATA_SHEET);
    
    if (!sheet) {
      logToSheet('ERROR: LiveStreamData sheet not found');
      throw new Error('LiveStreamData sheet not found');
    }
    
    logToSheet('Sheet found, preparing row data...');
    
    // Parse timestamp - handle multiple formats
    let timestampValue = new Date(); // Default to now
    if (data.timestamp) {
      try {
        timestampValue = new Date(data.timestamp);
        // Validate the date
        if (isNaN(timestampValue.getTime())) {
          logToSheet('WARNING: Invalid timestamp, using current time');
          timestampValue = new Date();
        }
      } catch (e) {
        logToSheet('WARNING: Error parsing timestamp: ' + e.toString());
        timestampValue = new Date();
      }
    }
    
    // Parse hoursStreamed - ensure it's a number or 0
    let hoursStreamedValue = 0;
    if (data.hoursStreamed !== null && data.hoursStreamed !== undefined) {
      try {
        hoursStreamedValue = parseFloat(data.hoursStreamed);
        if (isNaN(hoursStreamedValue)) {
          logToSheet('WARNING: hoursStreamed is NaN, using 0');
          hoursStreamedValue = 0;
        } else {
          // Round to 2 decimal places
          hoursStreamedValue = Math.round(hoursStreamedValue * 100) / 100;
        }
      } catch (e) {
        logToSheet('WARNING: Error parsing hoursStreamed: ' + e.toString());
        hoursStreamedValue = 0;
      }
    }
    
    logToSheet('hoursStreamedValue (parsed) = ' + hoursStreamedValue);
    
    // Prepare all row values
    // Headers: Timestamp | Gross Sales | Estimated Orders | Stream URL | 
    //          Streamer Name | Scheduled Start Time | STREAM ENDED | Last Activity Time | Stream RunTime
    const rowData = [
      timestampValue,                                    // Column A - Timestamp
      data.grossSales || 0,                              // Column B - Gross Sales
      data.estimatedOrders || 0,                         // Column C - Estimated Orders
      data.streamUrl || '',                              // Column D - Stream URL
      data.streamerName || 'Unknown',                    // Column E - Streamer Name
      data.scheduledStartTime || '',                     // Column F - Scheduled Start Time
      data.streamEnded || false,                         // Column G - STREAM ENDED
      data.lastActivityTime || '',                       // Column H - Last Activity Time
      hoursStreamedValue                                 // Column I - Stream RunTime
    ];
    
    logToSheet('Row data prepared, column I value: ' + rowData[8]);
    logToSheet('Full row data: ' + JSON.stringify(rowData));
    
    // Append the row (first 8 columns)
    const rowToAppend = rowData.slice(0, 9); // Make sure we have all 9 elements
    const lastRowBefore = sheet.getLastRow();
    sheet.appendRow(rowToAppend);
    
    logToSheet('Row appended successfully');
    
    // CRITICAL FIX: Explicitly set column I value after append
    // Sometimes appendRow doesn't properly handle all columns
    const lastRow = sheet.getLastRow();
    logToSheet('Last row number: ' + lastRow);
    
    // Explicitly set column I (index 9) with the hoursStreamed value
    const columnIRange = sheet.getRange(lastRow, 9); // Column I is index 9
    columnIRange.setValue(hoursStreamedValue);
    logToSheet('Explicitly set column I to: ' + hoursStreamedValue);
    
    // Verify the last row was written correctly
    const lastRowData = sheet.getRange(lastRow, 1, 1, 9).getValues()[0];
    logToSheet('Verification - Last row column I (index 8): ' + lastRowData[8]);
    logToSheet('Verification - Last row column I type: ' + typeof lastRowData[8]);
    logToSheet('Verification - Last row full data: ' + JSON.stringify(lastRowData));
    
  } catch (error) {
    logToSheet('ERROR in appendToLiveData: ' + error.toString());
    logToSheet('Error stack: ' + error.stack);
    throw error;
  }
}

function updateProductionStreamData(data) {
  try {
    logToSheet('updateProductionStreamData START');
    
    // Open Production Sheet
    const prodSheet = SpreadsheetApp.openById(PRODUCTION_SHEET_ID);
    const streamDataTab = prodSheet.getSheetByName(PRODUCTION_STREAM_DATA_TAB);
    
    if (!streamDataTab) {
      logToSheet('ERROR: Production StreamData tab not found');
      return;
    }
    
    const dataRange = streamDataTab.getDataRange();
    const values = dataRange.getValues();
    
    // Production Column mapping:
    // A = Stream Date
    // B = Stream Start Time
    // C = Streamer Name
    // D = Product Line
    // E = Units Sold
    // F = Gross Sale
    // G = Hours Streamed
    // H = Net Payout
    // I = Givvy Unit
    // J = Channel
    // K = LiveStream URL
    
    let matchFound = false;
    
    // Search for exact URL match in Column K (index 10)
    for (let i = 1; i < values.length; i++) {
      const rowUrl = values[i][10]; // Column K
      
      // Only proceed if there's an exact URL match
      if (rowUrl && rowUrl === data.streamUrl) {
        matchFound = true;
        const row = i + 1;
        
        logToSheet('Found matching URL in Production row ' + row);
        
        // Use hours from Show Time counter if available, otherwise calculate
        let hoursStreamed = 0;
        if (data.hoursStreamed !== null && data.hoursStreamed !== undefined) {
          // Use the hours sent by the extension (from Show Time counter)
          hoursStreamed = parseFloat(data.hoursStreamed);
          if (isNaN(hoursStreamed)) {
            hoursStreamed = 0;
          } else {
            hoursStreamed = Math.round(hoursStreamed * 100) / 100;
          }
          logToSheet('Using Show Time counter hours: ' + hoursStreamed);
        } else {
          // Fallback: calculate from scheduled start time
          logToSheet('No Show Time hours provided, calculating from schedule');
          const streamDate = values[i][0]; // Column A
          const streamStartTime = values[i][1]; // Column B
          
          if (streamDate && streamStartTime) {
            const scheduledStart = combineDateTime(streamDate, streamStartTime);
            if (scheduledStart) {
              hoursStreamed = calculateHours(data.streamUrl, scheduledStart, data.streamEnded, data.lastActivityTime);
            }
          }
        }
        
        // ONLY update columns E, F, G - never touch other columns
        streamDataTab.getRange(row, 5).setValue(data.estimatedOrders || 0); // Column E - Units Sold
        streamDataTab.getRange(row, 6).setValue(data.grossSales || 0); // Column F - Gross Sale
        streamDataTab.getRange(row, 7).setValue(hoursStreamed); // Column G - Hours Streamed
        
        logToSheet('Updated Production row ' + row + ' with hours: ' + hoursStreamed);
        
        break; // Stop after first match
      }
    }
    
    if (!matchFound) {
      logToSheet('No matching URL found in Production StreamData');
    }
    
  } catch (error) {
    logToSheet('ERROR in updateProductionStreamData: ' + error.toString());
    logToSheet('Error stack: ' + error.stack);
  }
}

function combineDateTime(dateValue, timeValue) {
  try {
    // Handle date - ensure we have a valid Date object
    let date;
    if (dateValue instanceof Date) {
      date = new Date(dateValue);
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (typeof dateValue === 'number') {
      // Excel serial date
      date = new Date((dateValue - 25569) * 86400 * 1000);
    } else {
      return null;
    }
    
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Handle time string
    let timeString = '';
    if (timeValue instanceof Date) {
      const hours = timeValue.getHours();
      const minutes = timeValue.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      timeString = displayHours + ':' + String(minutes).padStart(2, '0') + ' ' + ampm;
    } else if (typeof timeValue === 'string') {
      timeString = timeValue.trim();
    } else if (typeof timeValue === 'number') {
      // Excel time serial (fraction of a day)
      const totalMinutes = Math.round(timeValue * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      timeString = displayHours + ':' + String(minutes).padStart(2, '0') + ' ' + ampm;
    } else {
      return null;
    }
    
    // Parse time string (e.g., "5:00 PM")
    const timeMatch = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) {
      return null;
    }
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const meridiem = timeMatch[3].toUpperCase();
    
    // Convert to 24-hour format
    if (meridiem === 'PM' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }
    
    // Create Pacific Time date string
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const pacificDateString = year + '-' + month + '-' + day + 'T' + 
                              String(hours).padStart(2, '0') + ':' + 
                              String(minutes).padStart(2, '0') + ':00-08:00';
    
    const combined = new Date(pacificDateString);
    
    return combined;
    
  } catch (error) {
    return null;
  }
}

function calculateHours(streamUrl, scheduledStartTime, streamEnded, lastActivityTime) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const liveSheet = ss.getSheetByName(LIVE_DATA_SHEET);
    
    if (!liveSheet) {
      return 0;
    }
    
    const dataRange = liveSheet.getDataRange();
    const values = dataRange.getValues();
    
    let firstTimestamp = null;
    let lastTimestamp = null;
    let activityEndTime = null;
    let dataPointCount = 0;
    
    // Gather all data points for this stream from Bot Collector
    for (let i = 1; i < values.length; i++) {
      if (values[i][3] === streamUrl) { // Column D - Stream URL
        dataPointCount++;
        const timestamp = new Date(values[i][0]); // Column A - Timestamp
        const activityTime = values[i][7]; // Column H - Last Activity Time
        
        if (activityTime && !activityEndTime) {
          activityEndTime = new Date(activityTime);
        }
        
        if (!firstTimestamp || timestamp < firstTimestamp) {
          firstTimestamp = timestamp;
        }
        
        if (!lastTimestamp || timestamp > lastTimestamp) {
          lastTimestamp = timestamp;
        }
      }
    }
    
    // Use last activity time if provided
    if (lastActivityTime && !activityEndTime) {
      activityEndTime = new Date(lastActivityTime);
    }
    
    // PRIORITY 1: Complete stream capture
    if (scheduledStartTime && firstTimestamp && lastTimestamp && dataPointCount >= 5) {
      const timeDiffMinutes = Math.abs(firstTimestamp - scheduledStartTime) / (1000 * 60);
      
      if (timeDiffMinutes <= 10) {
        const diffMs = lastTimestamp - firstTimestamp;
        const diffHours = diffMs / (1000 * 60 * 60);
        return Math.round(diffHours * 100) / 100;
      }
    }
    
    // PRIORITY 2: Scheduled start + Activity end
    if (streamEnded && scheduledStartTime && activityEndTime) {
      const diffMs = activityEndTime - scheduledStartTime;
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours > 0 && diffHours < 12) {
        return Math.round(diffHours * 100) / 100;
      }
    }
    
    // PRIORITY 3: Scheduled start + Last scrape
    if (scheduledStartTime && lastTimestamp) {
      const diffMs = lastTimestamp - scheduledStartTime;
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours > 0 && diffHours < 12) {
        return Math.round(diffHours * 100) / 100;
      }
    }
    
    // PRIORITY 4: Timestamp range only
    if (firstTimestamp && lastTimestamp && dataPointCount >= 2) {
      const diffMs = lastTimestamp - firstTimestamp;
      const diffHours = diffMs / (1000 * 60 * 60);
      return Math.round(diffHours * 100) / 100;
    }
    
    return 0;
    
  } catch (error) {
    return 0;
  }
}

function testEndpoint() {
  const testData = {
    postData: {
      contents: JSON.stringify({
        timestamp: new Date().toISOString(),
        streamId: '3f969a50-c0d1-4ac7-a076-79f83be3597c',
        streamUrl: 'https://www.whatnot.com/dashboard/live/3f969a50-c0d1-4ac7-a076-79f83be3597c',
        grossSales: 1200,
        estimatedOrders: 130,
        hoursStreamed: 2.5,
        scheduledStartTime: '11/23 5:00PM',
        lastActivityTime: new Date().toISOString(),
        streamEnded: false,
        streamerName: 'Bryan'
      })
    }
  };
  
  const result = doPost(testData);
  Logger.log('Test result: ' + result.getContent());
}

function testCalculateHours() {
  const streamUrl = 'https://www.whatnot.com/dashboard/live/3f969a50-c0d1-4ac7-a076-79f83be3597c';
  const scheduledStart = new Date('2025-11-23T17:00:00-08:00');
  
  Logger.log('Testing calculateHours with:');
  Logger.log('  URL: ' + streamUrl);
  Logger.log('  Scheduled: ' + scheduledStart);
  
  const hours = calculateHours(streamUrl, scheduledStart, false, null);
  
  Logger.log('Result: ' + hours + ' hours');
}

function testProductionUpdate() {
  const testData = {
    timestamp: new Date().toISOString(),
    streamId: '3f969a50-c0d1-4ac7-a076-79f83be3597c',
    streamUrl: 'https://www.whatnot.com/dashboard/live/3f969a50-c0d1-4ac7-a076-79f83be3597c',
    grossSales: 1200,
    estimatedOrders: 130,
    hoursStreamed: 2.5,
    scheduledStartTime: '11/23 5:00PM',
    lastActivityTime: new Date().toISOString(),
    streamEnded: false,
    streamerName: 'Bryan'
  };
  
  Logger.log('=== MANUAL TEST START ===');
  updateProductionStreamData(testData);
  Logger.log('=== MANUAL TEST END ===');
}

function testWithHours() {
  const testData = {
    timestamp: new Date().toISOString(),
    streamId: '3f969a50-c0d1-4ac7-a076-79f83be3597c',
    streamUrl: 'https://www.whatnot.com/dashboard/live/3f969a50-c0d1-4ac7-a076-79f83be3597c',
    grossSales: 1280,
    estimatedOrders: 145,
    hoursStreamed: 2.35,
    scheduledStartTime: '11/23 5:00PM',
    lastActivityTime: new Date().toISOString(),
    streamEnded: false,
    streamerName: 'Bryan'
  };
  
  Logger.log('=== TEST WITH HOURS ===');
  Logger.log('Sending hoursStreamed: ' + testData.hoursStreamed);
  appendToLiveData(testData);
  Logger.log('Check column I in LiveStreamData sheet');
}
