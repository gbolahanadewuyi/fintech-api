//generate session id to to access mpay functions. sessionId expires after an hour
const request = require("request");
const rp = require('request-promise'); //perform requests in an async way
const Terminalnumber = "21297499";
const EncryptionKey = "2480759710240528";
const Transactionkey = "1157699898";
const mpayBusinessFuncUrl =
    "http://resadmin.mpay.com.gh/distributormobilerest/distributormobilerest/"; //For Basic Business functionality like Session Generation and Balance retrieval
const mpayTransactionFuncUrl =
    "http://tswitch.mpay.com.gh/productrest/productrest/"; //For Transaction functionalities like Product retrieval, Service Delivery (Topup, Bill Payment, Voucher Sale, Wallet)

const crypto = require("crypto"); //module needed to encrypt data
const algorithm = "AES-128-ECB";
const key = EncryptionKey;
var iv = Buffer.alloc(0);
const Cipherr = require("aes-ecb");

//System Service-ID
const M_Topup = 2;
const Data_Topup = 16;

async function genMpaySessionId() {
    let requestid = String(Math.round(Math.random() * 1000000000)); //generating request id every time we want to request for a sessionID
    let data = {
        RequestUniqueID: requestid,
        MethodName: "DstGenerateSessionID",
    };

    let sessionID;

    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        console.log("error encrypting data");
    } else {
        console.log(`data encrypted is: ${encryptedData}`);
        console.log(`TerminalNumber=${Terminalnumber}&Data=${encryptedData}`);

        var options = {
            method: 'POST',
            uri: mpayBusinessFuncUrl,
            body: `TerminalNumber=${Terminalnumber}&Data=${encryptedData}`,
            json: false // Automatically stringifies the body to JSON
        };

        try {
            //make call to the mpay-api
            let responseData = await rp(options);
            responsedata = JSON.parse(responseData)["Data"];
            console.log(`Response data : ${responsedata}`);
            decryptedData = decrypt(responsedata);

            if (decryptedData != null) {
                //remove padding string at the end of the decrypted string
                let stringdata = JSON.stringify(decryptedData);
                console.log(stringdata);
                let data;

                if (stringdata.includes("u0000")) {
                    let junklength = (stringdata.match(/u0000/g) || []).length;
                    let removejunkLength = 5 * junklength + junklength + 1;
                    let replacedData = stringdata.substring(0, stringdata.length - removejunkLength) + '"';
                    console.log(replacedData);
                    let parsedReplaceddata = JSON.parse(replacedData);
                    data = JSON.parse(parsedReplaceddata);
                } else {
                    let parseddata = JSON.parse(stringdata);
                    data = JSON.parse(parseddata);
                }
                console.log(data);

                // if the operation of getting sessionID is not successful
                if (data.ResponseCode !== "000") {
                    sessionID = null;
                } else {
                    sessionID = data.SessionID;
                    console.log(sessionID);
                }
            } else {
                console.log("Error decrypting api response for sessionID");
                sessionID = null;
            }
            return sessionID;
        } catch (e) {
            console.log(e)
            return null;
        }


    }
}



//debit customer momo
async function MpayDebitCustomerMomo(MomoNumber, chargedPrice, requestID, sessionid) {
    console.log(MomoNumber, chargedPrice, requestID, sessionid);
    let data = {
        function: "TransactionService",
        SessionID: sessionid,
        RequestUniqueID: requestID,
        ProductCode: "MTNMOMOCashout", //momowallet to mpay
        SystemServiceID: "64",
        WalletData: JSON.stringify({
            "Mobile Number": MomoNumber,
        }),
        Amount: chargedPrice, //value must be in multiple of 100
        FromANI: "",
        MethodName: "TransactionService",
    };

    let dataReturned;

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        console.log("error encrypting post data");
        return null;
    } else {
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`
        );
        let postdata = JSON.stringify(data);
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${postdata}`
        );

        var options = {
            method: 'POST',
            uri: mpayTransactionFuncUrl,
            body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            json: false // Automatically stringifies the body to JSON
        };

        try {
            let responseData = await rp(options);
            responsedata = JSON.parse(responseData)["Data"];
            console.log(`Response data : ${responsedata}`);
            decryptedData = decrypt(responsedata);

            if (decryptedData != null) {
                //remove padding string at the end of the decrypted string
                let stringdata = JSON.stringify(decryptedData);
                console.log(stringdata);
                let data;
                if (stringdata.includes("u0000")) {
                    console.log("unable to parse stringified decrypted data");
                    let junklength = (stringdata.match(/u0000/g) || []).length;
                    console.log(junklength);
                    let removejunkLength = junklength * 5 + junklength + 1;
                    console.log(removejunkLength);
                    console.log(
                        stringdata.substring(0, stringdata.length - removejunkLength)
                    );
                    let replacedData =
                        stringdata.substring(
                            0,
                            stringdata.length - removejunkLength
                        ) + '"';
                    console.log(replacedData);
                    let parsedReplaceddata = JSON.parse(replacedData);
                    data = JSON.parse(parsedReplaceddata);
                } else {
                    let parseddata = JSON.parse(stringdata);
                    data = JSON.parse(parseddata);
                }
                console.log(data);

                if (data.ResponseCode == "000") {
                    // res.status(200).send("check wallet transaction status");
                    dataReturned = data.ResponseCode;
                } else if (data.ResponseCode == "099") {
                    // res.status(200).send("check wallet transaction status");
                    dataReturned = data.ResponseCode;
                } else if (data.ResponseCode == "625") {
                    // res.status(400).send("invalid sessiodID")
                    dataReturned = null;
                } else if (data.ResponseCode == "102") {
                    console.log(data.ResponseCode);
                    // res.status(400).send("invalid sessiodID")
                    dataReturned = null;
                } else {
                    dataReturned = null;
                    // res.status(400).send('Error getting money from momo wallet');
                }

            } else {
                // res.status(401).send('Error decrypting api response');
                console.log("Error decrypting api response for sessionID");
                dataReturned = null;
                // return null;
            }
            return dataReturned;
        } catch (e) {
            console.log(e)
            return null;
        }


    }
}

//TODO:wallet transaction status. check after trying to debit a customer
async function mPayCustomerDebitTransactionCheck(requestID, sessionId) {
    let requestid = String(Math.round(Math.random() * 10000000000));
    console.log(requestid);
    let transactionRequestId = requestID; //requestid of the transaction you are checking the status for
    console.log(transactionRequestId);

    let data = {
        function: "WalletStatusCheck",
        SessionID: sessionId,
        RequestUniqueID: requestid,
        TransactionRequestUniqueID: transactionRequestId,
        MethodName: "WalletStatusCheck",
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`
        );
        let postdata = JSON.stringify(data);
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${postdata}`
        );

        var options = {
            method: 'POST',
            uri: mpayTransactionFuncUrl,
            body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            json: false
        };

        try {
            let responseData = await rp(options);
            responsedata = JSON.parse(responseData)["Data"];
            console.log(`Response data : ${responsedata}`);
            decryptedData = decrypt(responsedata);

            if (decryptedData != null) {
                //remove padding junk string at the end of the decrypted string
                let stringdata = JSON.stringify(decryptedData);
                console.log(stringdata);
                let data;

                if (stringdata.includes("u0000")) {
                    console.log("unable to parse stringified decrypted data");
                    let junklength = (stringdata.match(/u0000/g) || []).length;
                    let removejunkLength = junklength * 5 + junklength + 1;
                    let replacedData =
                        stringdata.substring(
                            0,
                            stringdata.length - removejunkLength
                        ) + '"';
                    let parsedReplaceddata = JSON.parse(replacedData);
                    data = JSON.parse(parsedReplaceddata);
                } else {
                    let parseddata = JSON.parse(stringdata);
                    data = JSON.parse(parseddata);
                }
                console.log(data);


                if (data.ResponseCode == "000") {
                    if (data.TransactionResponseCode != 000) {
                        //transaction is still pending from user side
                        dataReturned = null;
                    } else {
                        dataReturned = data.TransactionResponseCode;
                    }
                } else if (data.ResponseCode == "625") {
                    console.log("Invalid session id when checking wallet transaction status ");
                    dataReturned = null;
                } else {
                    console.log(
                        `Error checking wallet transaction status => ${data}`
                    );
                    dataReturned = null;
                }
            } else {
                console.log("Error decrypting api response for wallet transaction check");
                dataReturned = null;
            }
            return dataReturned;
        } catch (e) {
            console.log(e)
            return null;
        }

    }

}

//send money from mpayWallet to momo
async function mPayDebitMPayWallet(sessionID, recieverNumber, amount) {
    let requestid = String(Math.round(Math.random() * 10000000000));
    console.log(sessionID);
    let data = {
        function: "TransactionService",
        SessionID: sessionID,
        RequestUniqueID: requestid,
        ProductCode: "MTNMOMOCashin", //mpay to momo wallet
        SystemServiceID: "64",
        WalletData: JSON.stringify({
            "Mobile Number": recieverNumber,
        }),
        Amount: amount,
        FromANI: "",
        MethodName: "TransactionService",
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        let postdata = JSON.stringify(data);
        console.log(`TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${postdata}`);
        console.log(`TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`);

        var options = {
            method: 'POST',
            uri: mpayTransactionFuncUrl,
            body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            json: false
        };

        try {
            let responseData = await rp(options);
            responsedata = JSON.parse(responseData)["Data"];
            console.log(`Response data : ${responsedata}`);

            //decrypt api response
            decryptedData = decrypt(responsedata);

            if (decryptedData != null) {
                //remove padded junk string at the end of the decrypted string
                let stringdata = JSON.stringify(decryptedData);
                console.log(stringdata);
                let data;

                if (stringdata.includes("u0000")) {
                    console.log("unable to parse stringified decrypted data");
                    let junklength = (stringdata.match(/u0000/g) || []).length;
                    let removejunkLength = junklength * 5 + junklength + 1;
                    let replacedData = stringdata.substring(0, stringdata.length - removejunkLength) + '"';
                    console.log(replacedData);
                    let parsedReplaceddata = JSON.parse(replacedData);
                    data = JSON.parse(parsedReplaceddata);
                } else {
                    let parseddata = JSON.parse(stringdata);
                    data = JSON.parse(parseddata);
                }
                console.log(data.ResponseCode);

                if (data.ResponseCode == "000") {
                    dataReturned = data.ResponseCode;
                } else if (data.ResponseCode == "603") {
                    console.log(`insufficient funds Error => ${data}`);
                } else if (data.ResponseCode == "625") {
                    console.log(`Invalid sessiodID when sending money from mpaywallet to momo => ${data}`);
                } else if (data.ResponseCode == "045") {
                    console.log(`Invalid receiver number when sending money from mpaywallet to momo => ${data}`);
                    dataReturned = data.ResponseCode;
                } else {
                    console.log(`Error sending money from mpay wallet to momo => ${data}`);
                }
            } else {
                console.log("Error decrypting api response for sending money to momo");
                dataReturned = null;
            }
            return dataReturned;
        } catch (e) {
            console.log(e)
            // return null;
        }


    }

}

//mpay mtn topup flexi for airtime purchase
async function mpayTopupFlexi(recieverNumber, airtimeAmount, sessiodID) {
    let requestid = String(Math.round(Math.random() * 10000000000));
    let data = {
        SessionID: sessiodID,
        RequestUniqueID: requestid,
        ProductCode: "MTN01",
        SystemServiceID: "2", //as described in top-up product details
        ReferalNumber: recieverNumber, //phonenumber of user recieveing the airtime
        Amount: airtimeAmount,
        FromANI: "",
        Email: "",
        MethodName: "TopupFlexi",
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`
        );
        let postdata = JSON.stringify(data);
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${postdata}`
        );

        var options = {
            method: 'POST',
            uri: mpayTransactionFuncUrl,
            body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            json: false
        };

        try {
            let responseData = await rp(options);
            responsedata = JSON.parse(responseData)["Data"];
            console.log(`Response data : ${responsedata}`);
            decryptedData = decrypt(responsedata);

            if (decryptedData != null) {
                //remove padding string at the end of the decrypted string
                let stringdata = JSON.stringify(decryptedData);
                console.log(stringdata);
                let data;
                if (stringdata.includes("u0000")) {
                    console.log("unable to parse stringified decrypted data");
                    let junklength = (stringdata.match(/u0000/g) || []).length;
                    console.log(junklength);
                    let removejunkLength = junklength * 5 + junklength + 1;
                    console.log(removejunkLength);
                    console.log(
                        stringdata.substring(0, stringdata.length - removejunkLength)
                    );
                    let replacedData =
                        stringdata.substring(
                            0,
                            stringdata.length - removejunkLength
                        ) + '"';
                    console.log(replacedData);
                    let parsedReplaceddata = JSON.parse(replacedData);
                    data = JSON.parse(parsedReplaceddata);
                } else {
                    let parseddata = JSON.parse(stringdata);
                    data = JSON.parse(parseddata);
                }
                console.log(data);
                if (data.ResponseCode == "000") {
                    console.log("Mpay airtime purchase successful");
                    dataReturned = data.ResponseCode;
                } else if (data.ResponseCode == "042") {
                    console.log(`Error purchasing mpay top-up flexi  => ${data}`);
                    dataReturned = data.ResponseCode;
                } else if (data.ResponseCode == "625") {
                    console.log(`Error purchasing Mpay top-up flexi ${data}`);
                    dataReturned = null;
                } else {
                    console.log(`Error purchasing Mpay top-up flexi ${data}`);
                    dataReturned = null;
                }
            } else {
                console.log("Error decrypting api response for airtime purchase");
                dataReturned = null;
            }
            return dataReturned;
        } catch (e) {
            console.log(e)
            return null;
        }

    }
}

// mpay mtn top-upFix for mobile data bundle.
async function mpayMtnTopupFix(sessionID, recieverNumber, productCode) {
    let requestid = String(Math.round(Math.random() * 10000000000));
    let data = {
        SessionID: sessionID,
        RequestUniqueID: requestid,
        ProductCode: productCode,
        SystemServiceID: "16", //as described in top-up product details
        ReferalNumber: recieverNumber,
        FromANI: "",
        Email: "gwopz4adz@gmail.com",
        MethodName: "TopupFix",
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(`TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`);

        var options = {
            method: 'POST',
            uri: mpayTransactionFuncUrl,
            body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            json: false
        };

        try {
            let responseData = await rp(options);
            responsedata = JSON.parse(responseData)["Data"];
            console.log(`Response data : ${responsedata}`);
            decryptedData = decrypt(responsedata);

            if (decryptedData != null) {
                //remove padded junk at the end of the decrypted string
                let stringdata = JSON.stringify(decryptedData);
                console.log(stringdata);
                let data;

                if (stringdata.includes("u0000")) {
                    console.log("unable to parse stringified decrypted data");
                    let junklength = (stringdata.match(/u0000/g) || []).length;
                    console.log(junklength);
                    let removejunkLength = junklength * 5 + junklength + 1;
                    console.log(removejunkLength);
                    console.log(stringdata.substring(0, stringdata.length - removejunkLength));
                    let replacedData = stringdata.substring(0, stringdata.length - removejunkLength) + '"';
                    console.log(replacedData);
                    let parsedReplaceddata = JSON.parse(replacedData);
                    data = JSON.parse(parsedReplaceddata);
                } else {
                    let parseddata = JSON.parse(stringdata);
                    data = JSON.parse(parseddata);
                }
                console.log(data);

                if (data.ResponseCode == "000") {
                    dataReturned = data.ResponseCode
                } else if (data.ResponseCode == "042") {
                    dataReturned = data.ResponseCode
                } else if (data.ResponseCode == "314") {
                    dataReturned = null;
                    // res.status(400).send(data);
                } else if (data.ResponseCode == "625") {
                    dataReturned = null;
                    // res.status(400).send("invalid sessiodID");
                } else {
                    console.log("Error buying data bundlle from mpay");
                    dataReturned = null;
                }
            } else {
                console.log("Error decrypting api response for airtime purchase");
                dataReturned = null;

            }
            return dataReturned;
        } catch (e) {
            console.log(e)
            return null;
        }


    }
}



//mpay module for buying fibre data
async function mpayBillpay(sessionID, recieverNumber, productCode, topUPAmount) {
    let requestid = String(Math.round(Math.random() * 10000000000));
    let data = {
        "SessionID": sessionID,
        "RequestUniqueID": requestid,
        "ProductCode": productCode,
        "SystemServiceID": "16",
        "BillPayData": JSON.stringify({
            "Mobile Number": recieverNumber,
        }),
        "Amount": topUPAmount,
        "FromANI": "",
        "Email": "",
        "MethodName": "BillPay"
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(`TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`);

        var options = {
            method: 'POST',
            uri: mpayTransactionFuncUrl,
            body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            json: false
        };

        try {
            let responseData = await rp(options);
            responsedata = JSON.parse(responseData)["Data"];
            console.log(`Response data : ${responsedata}`);
            decryptedData = decrypt(responsedata);

            if (decryptedData != null) {
                //remove padded junk at the end of the decrypted string
                let stringdata = JSON.stringify(decryptedData);
                console.log(stringdata);
                let data;

                if (stringdata.includes("u0000")) {
                    console.log("unable to parse stringified decrypted data");
                    //check for the length of the total junk string
                    let junklength = (stringdata.match(/u0000/g) || []).length;
                    console.log(junklength);
                    let removejunkLength = junklength * 5 + junklength + 1;
                    console.log(removejunkLength);
                    console.log(stringdata.substring(0, stringdata.length - removejunkLength));
                    let replacedData = stringdata.substring(0, stringdata.length - removejunkLength) + '"';
                    console.log(replacedData);
                    let parsedReplaceddata = JSON.parse(replacedData);
                    data = JSON.parse(parsedReplaceddata);
                } else {
                    let parseddata = JSON.parse(stringdata);
                    data = JSON.parse(parseddata);
                }
                console.log(data);

                if (data.ResponseCode == "000") {
                    dataReturned = data.ResponseCode
                } else if (data.ResponseCode == "042") {
                    dataReturned = data.ResponseCode
                } else if (data.ResponseCode == "314") {
                    dataReturned = null;
                    // res.status(400).send(data);
                } else if (data.ResponseCode == "625") {
                    dataReturned = null;
                    // res.status(400).send("invalid sessiodID");
                } else {
                    console.log("Error buying data bundlle from mpay");
                    dataReturned = null;
                }
            } else {
                console.log("Error decrypting api response for airtime purchase");
                dataReturned = null;

            }
            return dataReturned;
        } catch (e) {
            console.log(e)
            return null;
        }


    }
}







//mpay topup product details
function mpayTopupProductDetails() {
    let requestid = String(Math.round(Math.random() * 10000000000));
    console.log(requestid);
    //get sessionID from configuration file
    var sessionID = fs.readFileSync("./config.txt", "utf8");
    console.log(sessionID);
    let data = {
        function: "TopupProductDetails",
        SessionID: sessionID,
        RequestUniqueID: requestid,
        SystemServiceID: "2",
        MethodName: "TopupProductDetails",
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`
        );
        let postdata = JSON.stringify(data);
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${postdata}`
        );
        request.post({
                // headers: {'content-type': 'application/json'},
                url: mpayTransactionFuncUrl,
                body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            },
            (err, mpayResponse, body) => {
                if (!err) {
                    console.log("success");
                    console.log(mpayResponse.statusCode);
                    console.log(body);
                    if (mpayResponse.statusCode == 200) {
                        responsedata = JSON.parse(body)["Data"]; //access the body object
                        console.log(`Response data : ${responsedata}`);
                        decryptedData = decrypt(responsedata);
                        if (decryptedData != null) {
                            //remove padding string at the end of the decrypted string
                            let stringdata = JSON.stringify(decryptedData);
                            console.log(stringdata);
                            let data;

                            if (stringdata.includes("u0000")) {
                                console.log("unable to parse stringified decrypted data");
                                let junklength = (stringdata.match(/u0000/g) || []).length;
                                console.log(junklength);
                                let removejunkLength = junklength * 5 + junklength + 1;
                                console.log(removejunkLength);
                                console.log(
                                    stringdata.substring(0, stringdata.length - removejunkLength)
                                );
                                let replacedData =
                                    stringdata.substring(
                                        0,
                                        stringdata.length - removejunkLength
                                    ) + '"';
                                console.log(replacedData);
                                let parsedReplaceddata = JSON.parse(replacedData);
                                data = JSON.parse(parsedReplaceddata);
                            } else {
                                let parseddata = JSON.parse(stringdata);
                                data = JSON.parse(parseddata);
                            }
                            console.log(data.ResponseCode);

                            if (data.ResponseCode == "000") {
                                res.status(200).send(data);
                            } else if (data.ResponseCode == "625") {
                                res.status(400).send("invalid sessiodID");
                            } else {
                                res.status(400).send("Error retrieving balance");
                            }
                        } else {
                            res.status(401).send("Error decrypting api response");
                        }
                    } else {
                        res.status(401).json(mpayResponse);
                    }
                } else {
                    console.log(err);
                    res.status(400).send("Error establishing connection");
                }
            }
        );
    }
};

//mpay billpay, data and fibre top-up product details
function mpayBillPayProductDetails() {
    let requestid = String(Math.round(Math.random() * 10000000000));
    console.log(requestid);
    //get sessionID from configuration file
    var sessionID = fs.readFileSync("./config.txt", "utf8");
    console.log(sessionID);
    let data = {
        SessionID: sessionID,
        RequestUniqueID: requestid,
        SystemServiceID: "",
        MethodName: "BillpayProductDetails",
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`
        );
        let postdata = JSON.stringify(data);
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${postdata}`
        );
        request.post({
                // headers: {'content-type': 'application/json'},
                url: mpayTransactionFuncUrl,
                body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            },
            (err, mpayResponse, body) => {
                if (!err) {
                    console.log("success");
                    console.log(mpayResponse.statusCode);
                    console.log(body);
                    if (mpayResponse.statusCode == 200) {
                        responsedata = JSON.parse(body)["Data"]; //access the body object
                        console.log(`Response data : ${responsedata}`);
                        decryptedData = decrypt(responsedata);
                        if (decryptedData != null) {
                            //remove padding string at the end of the decrypted string
                            let stringdata = JSON.stringify(decryptedData);
                            console.log(stringdata);
                            let data;

                            if (stringdata.includes("u0000")) {
                                console.log("unable to parse stringified decrypted data");
                                let junklength = (stringdata.match(/u0000/g) || []).length;
                                console.log(junklength);
                                let removejunkLength = junklength * 5 + junklength + 1;
                                console.log(removejunkLength);
                                console.log(
                                    stringdata.substring(0, stringdata.length - removejunkLength)
                                );
                                let replacedData =
                                    stringdata.substring(
                                        0,
                                        stringdata.length - removejunkLength
                                    ) + '"';
                                console.log(replacedData);
                                let parsedReplaceddata = JSON.parse(replacedData);
                                data = JSON.parse(parsedReplaceddata);
                            } else {
                                let parseddata = JSON.parse(stringdata);
                                data = JSON.parse(parseddata);
                            }
                            console.log(data.ResponseCode);

                            if (data.ResponseCode == "000") {
                                res.status(200).send(data);
                            } else if (data.ResponseCode == "625") {
                                res.status(400).send("invalid sessiodID");
                            } else {
                                res.status(400).send("Error retrieving balance");
                            }
                        } else {
                            res.status(401).send("Error decrypting api response");
                        }
                    } else {
                        res.status(401).json(mpayResponse);
                    }
                } else {
                    console.log(err);
                    res.status(400).send("Error establishing connection");
                }
            }
        );
    }
};

//mpay wallet products
function mpayWalletProductRetrieval() {
    let requestid = String(Math.round(Math.random() * 10000000000));
    console.log(requestid);
    //get sessionID from configuration file
    var sessionID = fs.readFileSync("./config.txt", "utf8");
    console.log(sessionID);
    let data = {
        function: "WalletProductDetails",
        SessionID: sessionID,
        RequestUniqueID: requestid,
        SystemServiceID: "",
        MethodName: "WalletProductDetails",
    };

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`
        );
        let postdata = JSON.stringify(data);
        console.log(
            `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${postdata}`
        );
        request.post({
                // headers: {'content-type': 'application/json'},
                url: mpayTransactionFuncUrl,
                body: `TerminalNumber=${Terminalnumber}&TransactionKey=${Transactionkey}&Data=${encryptedData}`,
            },
            (err, mpayResponse, body) => {
                if (!err) {
                    console.log("success");
                    console.log(body);
                    if (mpayResponse.statusCode == 200) {
                        responsedata = JSON.parse(body)["Data"]; //access the body object
                        console.log(`Response data : ${responsedata}`);
                        decryptedData = decrypt(responsedata);
                        if (decryptedData != null) {
                            let stringdata = JSON.stringify(decryptedData);
                            console.log(stringdata);
                            let data;

                            if (stringdata.includes("u0000")) {
                                console.log("unable to parse stringified decrypted data");
                                let junklength = (stringdata.match(/u0000/g) || []).length;
                                console.log(junklength);
                                let removejunkLength = junklength * 5 + junklength + 1;
                                console.log(removejunkLength);
                                console.log(
                                    stringdata.substring(0, stringdata.length - removejunkLength)
                                );
                                let replacedData =
                                    stringdata.substring(
                                        0,
                                        stringdata.length - removejunkLength
                                    ) + '"';
                                console.log(replacedData);
                                let parsedReplaceddata = JSON.parse(replacedData);
                                data = JSON.parse(parsedReplaceddata);
                            } else {
                                let parseddata = JSON.parse(stringdata);
                                data = JSON.parse(parseddata);
                            }
                            console.log(data.ResponseCode);

                            if (data.ResponseCode == "000") {
                                res.status(200).send(data);
                            } else if (data.ResponseCode == "625") {
                                res.status(400).send("invalid sessiodID");
                            } else {
                                res.status(400).send("Error getting wallet products");
                            }
                        } else {
                            res.status(401).send("Error decrypting api response");
                        }
                    } else {
                        res.status(401).json(mpayResponse);
                    }
                } else {
                    console.log(err);
                    res.status(400).send("Error establishing connection");
                }
            }
        );
    }
};


async function retrieveMpayBalance() {
    let requestid = String(Math.round(Math.random() * 10000000000));
    console.log(requestid);
    //get sessionID from configuration file
    var sessionID = fs.readFileSync("./config.txt", "utf8");
    console.log(sessionID);

    // console.log(sessionID);
    let data = {
        SessionID: sessionID,
        RequestUniqueID: requestid, //must be 11 chars
        MethodName: "DstGetBalance",
    };
    console.log(data);

    //encrypt data
    let encryptedData = nonPaddingEncryption(data);
    if (encryptedData == null) {
        res.status(400).send("error encrypting post data");
    } else {
        console.log(`TerminalNumber=${Terminalnumber}&Data=${encryptedData}`);
        let postdata = JSON.stringify(data);
        console.log(`TerminalNumber=${Terminalnumber}&Data=${postdata}`);
        request.post({
                // headers: {'content-type': 'application/json'},
                url: mpayBusinessFuncUrl,
                body: `TerminalNumber=${Terminalnumber}&Data=${encryptedData}`,
            },
            (err, mpayResponse, body) => {
                if (!err) {
                    console.log("success");
                    console.log(mpayResponse.statusCode);
                    console.log(body);
                    if (mpayResponse.statusCode == 200) {
                        responsedata = JSON.parse(body)["Data"]; //access the body object
                        console.log(`Response data : ${responsedata}`);
                        decryptedData = decrypt(responsedata);
                        if (decryptedData != null) {
                            //remove padding string at the end of the decrypted string
                            let stringdata = JSON.stringify(decryptedData);
                            console.log(stringdata);

                            if (stringdata.includes("u0000")) {
                                console.log("unable to parse stringified decrypted data");
                                let junklength = (stringdata.match(/u0000/g) || []).length;
                                console.log(junklength);
                                let removejunkLength = junklength * 5 + junklength + 1;
                                console.log(removejunkLength);
                                console.log(
                                    stringdata.substring(0, stringdata.length - removejunkLength)
                                );
                                let replacedData =
                                    stringdata.substring(
                                        0,
                                        stringdata.length - removejunkLength
                                    ) + '"';
                                console.log(replacedData);
                                let parsedReplaceddata = JSON.parse(replacedData);
                                data = JSON.parse(parsedReplaceddata);
                            } else {
                                let parseddata = JSON.parse(stringdata);
                                data = JSON.parse(parseddata);
                            }
                            console.log(data.ResponseCode);

                            //if the operation of getting our mpay balance is not successful
                            if (data.ResponseCode != "000") {
                                // res.status(400).send('Error retrieving balance');
                                console.log(`Error retrieving mpayBalance => ${data}`);
                                return null;
                            } else {
                                let mpayBalance = data.Balance;
                                console.log(`mpayBalance is ${mpayBalance}`);
                                // res.status(200).send(data);
                                return mpayBalance;
                            }
                        } else {
                            // res.status(401).send('Error decrypting api response');
                            console.log(
                                "Error decrypting api response for getting mPay balance"
                            );
                            return null;
                        }
                    } else {
                        // res.status(401).json(mpayResponse);
                        console.log(
                            "unauthorised access to mpay-api, check postdata encryption"
                        );
                        return null;
                    }
                } else {
                    // console.log(err);
                    // res.status(400).send("Error establishing connection");
                    console.log(
                        `Error establishing connection to mpay-api for retrieving mpay balace`
                    );
                    return null;
                }
            }
        );
    }
}


//function to encrypt data going to the mpay-api
function nonPaddingEncryption(data) {
    //convert json object to string
    let string = JSON.stringify(data);
    let buffer = Buffer.alloc(512);
    console.log(buffer.write(string, "utf-8"));
    console.log("returned buffer string" + buffer.toString("utf-8"));
    let bufferString = buffer.toString("utf-8");
    try {
        let cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);

        let encrypted = cipher.update(bufferString);
        cipher.setAutoPadding(false); //remove padding
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        console.log("encrypted" + encrypted);

        //encode encrypted string to base64
        encryptedString = encrypted.toString("base64");
        console.log(encryptedString);

        //replace chars
        let replaceChars = {
            "+": "-",
            "/": "_",
            "=": ","
        };
        let replacedEncryptedString = encryptedString.replace(
            /[+/=]/g,
            (m) => replaceChars[m]
        );
        console.log("replacedString:" + replacedEncryptedString);

        return replacedEncryptedString;
    } catch (e) {
        console.log(e);
        return null;
    }
}

//function to decrypt data coming from the mpay-api
function decrypt(data) {
    console.log(`data sent to decrypt function ${data}`);
    //replace chars
    let replaceChars = {
        "-": "+",
        "_": "/",
        ",": "="
    };
    let s = data.replace(/[-_,]/g, (m) => replaceChars[m]);
    console.log("replacedText:" + s);

    // decode encrypted base64 string
    let EncryptedText = s.toString("utf8");

    //decrypt string
    var resp = Cipherr.decrypt(key, EncryptedText);
    console.log(`decrypted data: ${resp}`);
    return resp;
}

module.exports = {
    genMpaySessionId,
    MpayDebitCustomerMomo,
    mPayCustomerDebitTransactionCheck,
    mpayTopupFlexi,
    mPayDebitMPayWallet,
    mpayMtnTopupFix,
    mpayBillpay
}; //expose functions 