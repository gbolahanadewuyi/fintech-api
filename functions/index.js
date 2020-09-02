// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require("firebase-functions");

// The Firebase Admin SDK to access Cloud Firestore.
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
const express = require("express");
const app = express();
const cors = require("cors")({
    origin: true,
});
const fs = require("fs");
const MPayMtnMobileDataBundle = require('./mobiledatabundle.json');
const MPayMtnFibreBundle = require('./mtnfibrebundles.json')
const jwt = require("jsonwebtoken");

//TODO:store in environment configurations
//secret for signing jwt token;
//store as environment config
const accessTokenSecret = "vdgcvdtcvkcvdtckctdsv";
//import module for using stripe with a test key
const stripe = require("stripe")(
    "sk_test_51Gsn0GGyFU7tb0kHHowmghXecM2krqZ9oVo3X9bVJV6dcDI0VCMn5wANrovBBTU6huARuCOWpsTWYxWAA09XECiX00zUdOjiSQ"
);
//import module for sending emails
const nodemailer = require("nodemailer");

//import module for encrypting or hashing passwords
const bcrypt = require("bcrypt");
const saltRounds = 10;

//initialize twilio sms
const client = require("twilio")(
    functions.config().twilio.accountsid,
    functions.config().twilio.authtoken
);
// initialize gmail credentials
const gmailEmail = functions.config().gmail.email;
const gmailPassword = functions.config().gmail.password;

const mailTransport = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: gmailEmail,
        pass: gmailPassword,
    },
});

const MPAY = require("./mpay-api-functions");

// company name to include in the emails and sms
const APP_NAME = "OneCash";

//middleware function to handle authentication process
const authenticateUser = (req, res, next) => {
    console.log(req.path);
    const authHeader = req.headers.authorization;
    if (
        req.path == "/api/sendOTP" ||
        req.path == "/api/login" ||
        req.path == "/api/registration" ||
        req.path == "/api/forgetpassword" ||
        req.path == "/api/reset_password" ||
        req.path == "/api/buyAirtime" ||
        req.path == "/api/sendMoney" ||
        req.path == "/api/buydatabundle" ||
        req.path == "/api/buyFibreBundle" ||
        req.path == "/api/fundMpayWallet"
    ) {
        next(); //continue with request
    } else if (!authHeader) {
        res.status(401).send({
            success: false,
            message: "No token provided",
        });
    } else {
        //read token from the authorization header
        const token = authHeader.split("Bearer ")[1];
        console.log(token);

        jwt.verify(token, accessTokenSecret, (err, user) => {
            if (err) {
                console.log(err);
                res.status(401).json("Error verifying token");
            } else {
                //adding the user object to the request. user info can be fetched from req.user on endpoints
                req.user = user;
                next();
            }
        });
    }
};

app.use(authenticateUser);

//endpoint to send otp to users
//TODO:adjust send otp endpoint. check if a phonenumber is already verified
app.post("/api/sendOTP", async (req, res) => {
    let phone = req.body.phone;
    console.log(phone);
    let otp = String(Math.round(Math.random() * 10000));
    try {
        let message = await client.messages.create({
            body: `Here is your one time otp to verify your phone number on the OneCash Wallet App: ${otp}`,
            from: "+12058579003",
            to: phone,
        });
        res.status(200).send({
            status: 200,
            message: "sms sent successfully",
            messageid: message.sid,
            otp: otp,
        });
    } catch (e) {
        console.log(e.toString());
        //change this once you have updgraded your twilio plan
        res.status(500).json(e.toString());
    }
});

//endpoint to register user
app.post("/api/registration", async (req, res) => {
    //you can add email to the user details
    let phone = req.body.phone;
    let pin = req.body.pin;
    let email = req.body.email;
    let name = req.body.name;
    let IdType = req.body.IdType;
    let ID_Number = req.body.ID_Number
    let accountType = req.body.accountType
    let data = {
        phone: phone,
        pin: pin,
        email: email,
        name: name,
        IdType: IdType,
        ID_Number: ID_Number,
        accountType: accountType
    }
    try {
        let userRecord = await admin.auth().createUser({
            phoneNumber: phone,
            email: email,
            // password: password,
            displayName: name,
            // photoURL: '', //add an image placeholder
        });
        console.log("User created with id:", userRecord.uid);
        //storing user data in db
        registrationStatus = await register(data, userRecord.uid);
        if (registrationStatus == true) {
            res.status(200).json("Registration successful")
        } else {
            res.status(500).json();
        }
    } catch (e) {
        console.log(e.toString());
        res.status(400).json(e.code);
        //check if is this works on your next deployment
    }
    // return null;
});

//creates a document containing new user's data
async function register(data, uid) {
    let phone = data.phone;
    let pin = data.pin;
    let email = data.email;
    let name = data.name;
    let IdType = data.IdType;
    let ID_Number = data.ID_Number;
    let accountType = data.accountType;
    //create stripe customer for new users
    let newStripeCustomer = await stripe.customers.create({
        name: name,
    });
    console.log(`New stripe customer has been created !`, newStripeCustomer.id);

    //hash pincode
    let hashedPin = await bcrypt.hash(pin, saltRounds).catch((e) => {
        console.log(`Error hashing password : ${e}`);
    });

    console.log(`hashedPin is : ${hashedPin}`);
    let docref = db.collection("walletUsers");
    let registrationStatus;
    try {
        await docref
            .doc(uid)
            .set({
                phone: phone,
                email: email,
                name: name,
                pin: hashedPin,
                stripeId: newStripeCustomer.id,
                IdType: IdType,
                ID_Number: ID_Number,
                accountType: accountType
            })
        registrationStatus = true
    } catch (e) {
        console.log(e.toString());
        registrationStatus = false

    }
    return registrationStatus;
}

exports.sendWelcomeMessage = functions.auth.user().onCreate((user) => {
    let name = user.displayName;
    let email = user.email;
    let phone = user.phoneNumber;

    return sendWelcomeText(name, phone), sendWelcomeEmail(name, email);
});

//sends a welcome text message to the new user
async function sendWelcomeText(name, phone) {
    try {
        let message = await client.messages.create({
            body: `Hi ${name}!, Welcome to ${APP_NAME}, The wonderful payment experience! Your account has been created successfully. We hope you enjoy our services`,
            from: "+12058579003",
            to: phone,
        });
        console.log(`SMS sent successfully with messageid : ${message.sid} `);
    } catch (e) {
        console.log("Error sending sms:" + e);
    }
    return null;
}

//send welcome email to the new user
async function sendWelcomeEmail(name, email) {
    const mailOptions = {
        from: `${APP_NAME} <noreply@onecashgh.com>`,
        to: email,
    };

    // The user subscribed to the newsletter.
    mailOptions.subject = `Welcome to ${APP_NAME}!`;
    mailOptions.text = `Hi ${name}! Welcome to ${APP_NAME}, The wonderful payment experience!. We hope you will enjoy our service.`;
    await mailTransport.sendMail(mailOptions).catch((e) => {
        console.log(`Error sending email because ${e}`);
    });
    console.log("New welcome email sent to:", email);
    return null;
}

//this function triggers after a new user document has been created
exports.createUserWallet = functions.firestore
    .document("walletUsers/{walletUsersId}")
    .onCreate(async (snap, context) => {
        let uid = context.params.walletUsersId;
        let email = snap.data().email;
        let accountType = snap.data().accountType
        let doc = db.collection("walletUsers").doc(uid).collection("Wallets");
        try {
            wallet = await doc.add({
                name: `${email}'s wallet`,
                currency: "GHS",
                amount: 0,
                userId: uid,
                accountType: accountType
            });
            console.log(wallet.id);
        } catch (e) {
            console.log(e);
        }
    });




//login user
//endpoint to login
app.post("/api/login", async (req, res) => {
    let phone = req.body.phone;
    let pin = req.body.pin;
    let user = await admin
        .auth()
        .getUserByPhoneNumber(phone)
        .catch((e) => {
            console.log(e);
            res.status(400).json(e.code);
        });

    console.log(user);
    if (user) {
        try {
            let docref = db.collection("walletUsers").doc(user.uid);
            let userDetails = await docref.get();
            if (userDetails.exists) {
                //   console.log(userDetails);
                if (!pin) {
                    res.status(403).json("User did not enter pincode");
                }
                let hashedPin = userDetails.data().pin;
                //check plain-text password against hashed password stored in the db
                pinCheckResult = await bcrypt.compare(pin, hashedPin);
                if (pinCheckResult == true) {
                    //get wallet details
                    // let walletdetails = [];
                    // await db
                    //     .collection("walletUsers")
                    //     .doc(userDetails.id)
                    //     .collection("Wallets")
                    //     .get()
                    //     .then((querySnapshot) => {
                    //         querySnapshot.forEach((doc) => {
                    //             console.log(doc.id, " => ", doc.data());
                    //             //include id to each documents
                    //             walletdetails.push({
                    //                 id: doc.id,
                    //                 ...doc.data(),
                    //             });
                    //         });
                    //     });

                    //create access token containing some user information
                    //token expires after one hour
                    const accessToken = jwt.sign({
                            uid: userDetails.id,
                            name: userDetails.data().name,
                            email: userDetails.data().email,
                            phone: userDetails.data().phone,
                            stripeId: userDetails.data().stripeId,
                        },
                        accessTokenSecret, {
                            expiresIn: "1h",
                        }
                    );

                    res.status(200).send({
                        message: "User logged in successfully",
                        token: accessToken,
                        // id: userDetails.id,
                        // name: userDetails.data().name,
                        // email: userDetails.data().email,
                        // phone: userDetails.data().phone,
                        // stripeId: userDetails.data().stripeId,
                        // wallets: walletdetails,
                    });
                } else {
                    res.status(400).json("wrong password");
                }
            }
        } catch (err) {
            console.log("error getting document", err);
            res.status(500).json(err);
        }
    }
});


app.post('/api/getUserData', async (req, res) => {
    let uid = req.user.uid
    let name = req.user.name;
    let email = req.user.email;
    let phone = req.user.phone;

    try {

        // get wallet details
        let walletdetails = [];
        await db
            .collection("walletUsers")
            .doc(uid)
            .collection("Wallets")
            .get()
            .then((querySnapshot) => {
                querySnapshot.forEach((doc) => {
                    console.log(doc.id, " => ", doc.data());
                    //include id to each documents
                    walletdetails.push({
                        id: doc.id,
                        ...doc.data(),
                    });
                });
            });

        res.status(200).send({
            name: name,
            email: email,
            phone: phone,
            wallets: walletdetails,
        });


    } catch (err) {
        console.log("error getting userDataWallets", err);
        res.status(500).json(err);
    }
});

//endpoint for users to add cards
app.post("/api/addCard", async (req, res) => {
    let uid = req.user.uid;
    let uStripeId = req.user.stripeId;

    //take note of pci compliance
    //stripe would normally use his api to accept sensitive card details from the client and then creates a token for that card
    //which you can pass to the backend and then assign to a stripe customer
    //in our case, we would be pci compliant so we would be creating the token from our end;
    //we can only use test cards because  we are on test mode with stripe(test api key). to get a live apikey, we need to create an account with stripe
    //we cant because stripe doesn't work in ghana

    //tokenizing credit card
    token = await stripe.tokens
        .create({
            card: {
                number: req.body.cardNumber,
                exp_month: req.body.exp_month,
                exp_year: req.body.exp_year,
                cvc: req.body.cvc,
            },
        })
        .catch((e) => {
            console.log(e);
            res.status(400).send("Error creating card", e);
        });

    //adding to token to the stripe user(linking a user to a source)
    cardDetails = await stripe.customers
        .createSource(uStripeId, {
            source: token.id,
        })
        .catch((e) => {
            console.log(e);
            res.status(400).send("Error adding card to customer", e);
        });

    //storing the returned card object in firestore
    //creating subcollections for cards. would fetch it every time a user needs to use his cards
    //note: you might have to adjust this incase you want to add card detials data to the json object being sent to user upon login
    let doc = db.collection("walletUsers").doc(uid).collection("Cards");
    try {
        await doc.add(cardDetails);
        res.status(200).send("Card created and assigned to user");
    } catch (e) {
        console.log(e);
        res.status(400).send("Error assigning card to user", e);
    }
});

//endpoint for wallet users to add or save their momo accounts
app.post("/api/addMomo", async (req, res) => {
    let uid = req.user.uid;
    let doc = db.collection("walletUsers").doc(uid).collection("MomoAccounts");
    try {
        docref = await doc.add({
            network: req.body.network,
            phoneNumber: req.body.phone,
        });
        console.log(docref.id);
        res.status(200).send("Momo account stored and assigned to wallet user");
    } catch (e) {
        console.log(`Error adding momo account: ${e}`);
        res.status(400).send("Error adding momo account");
    }
});

//endpoint for wallet users to add or save their bank account
app.post("/api/addBankAccount", async (req, res) => {
    let uid = req.user.id;
    //not creating bank accounts via stripe because stripe does not support all countries/currency (in this case ghana);
    let bankAccount = {
        bank_name: req.body.bank_name,
        currency: req.body.currency,
        account_holder_name: req.body.accName,
        account_number: req.body.accNumber,
    };
    let doc = db.collection("WalletUsers").doc(uid).collection("BankAccounts");

    try {
        let docref = await doc.add(bankAccount);
        console.log(`Bank account created with id: ${docref.id}`);
        res.status(200).send("Bank account created");
    } catch (e) {
        console.log(`Error adding bank account: ${e}`);
        res.status(400).send("Error adding bank account");
    }
});

//endpoint for wallet users to add their contacts(people they can send money to)
app.post("/api/addContact", async (req, res) => {
    let uid = req.user.uid;
    let doc = db.collection("walletUsers").doc(uid).collection("Contacts");
    try {
        docref = await doc.add({
            name: req.body.name,
            phoneNumber: req.body.phone,
        });
        console.log(docref.id);
        res.status(200).send("new contact stored and linked to wallet user");
    } catch (e) {
        console.log(`Error adding user contact: ${e}`);
        console.log(400).send("Error adding wallet user contact");
    }
});

//user enters his phonenumber, we check if the phone is associated with an account,
// if it is, we send an otp to the user, the user verifes the otp, the user enters his new passowrd
//An email and sms would be sent to user after the password is updated successfully
app.post("/api/forgetpassword", async (req, res) => {
    phone = req.body.phone;
    let otp = String(Math.round(Math.random() * 1000000));
    //check if the phonenumber entered is associated with any user

    try {
        let user = await admin.auth().getUserByPhoneNumber(phone);

        let message = await client.messages.create({
            body: `${otp} is your code to reset your OneCash wallet password. Don't reply this message with your code`,
            from: "+12058579003",
            to: user.phoneNumber,
        });

        res.status(200).send({
            uid: user.uid,
            phone: user.phoneNumber,
            name: user.displayName,
            email: user.email,
            otp: otp,
            message: message.sid,
        });
    } catch (e) {
        console.log(e.code);
        res.status(400).json("Phonenumber not associated with any account");
    }
});

app.post("/api/reset_password", async (req, res) => {
    let newPinCode = req.body.pin;
    let uid = req.body.id;
    //hash pincode
    let newHashedPinCode = await bcrypt
        .hash(newPinCode, saltRounds)
        .catch((e) => {
            console.log(`Error hashing password : ${e}`);
        });
    var docref = db.collection("walletUsers").doc(uid);
    try {
        //update the user's doc with new password
        await docref.update({
            password: newHashedPinCode,
        });
        //fetch user document to access some of its data
        let doc = await docref.get();

        //send sms to user about password update
        return (
            sendPasswordUpdateText(doc.data().name, doc.data().phone),
            //send email to user about password update
            sendPasswordUpdateEmail(doc.data().name, doc.data().email),
            res.status(200).send("Password updated successfully")
        );
    } catch (e) {
        console.log(e);
        res.status(400).json(e);
    }
});

//this function is triggered whenever there is an update in any document in firestore
// exports.sendPasswordUpdateMessage = functions.firestore.document('walletUsers/{walletUsersId}').onUpdate((change, context) => {
//     //get an object representing the updated document
//     const newValue = change.after.data();
//     //get an object representing the value before the update
//     const previousValue = change.before.data();
//     console.log(`new password is :${newValue.password}`);
//     console.log(`old password is ${previousValue.password}`);

//     if (newValue.password !== previousValue.password) {
//         return sendPasswordUpdateText(newValue.name, newValue.phone),
//             sendPasswordUpdateEmail(newValue.name, newValue.email);
//     } else {
//         console.log("Password was not changed")
//         return null;
//     }

// })

//sms sent to user upon successful password update
async function sendPasswordUpdateText(name, phone) {
    try {
        let message = await client.messages.create({
            body: `Hi ${name}! your ${APP_NAME} wallet pin has been updated successfully`,
            from: "+12058579003",
            to: phone,
        });
        console.log(`SMS sent successfully with messageid : ${message.sid} `);
    } catch (e) {
        console.log("Error sending sms:" + e);
    }
    return null;
}

//email sent to user upon a successful password update
async function sendPasswordUpdateEmail(name, email) {
    const mailOptions = {
        from: `${APP_NAME} <noreply@onecashgh.com>`,
        to: email,
    };

    mailOptions.subject = `${APP_NAME} wallet password updated!`;
    mailOptions.text = `Hi ${name}! your ${APP_NAME} wallet pin has been updated successfully`;
    await mailTransport.sendMail(mailOptions).catch((e) => {
        console.log(`Error sending email because ${e}`);
    });
    console.log("New password update email sent to:", email);
    return null;
}

//endpoint for users to buy airtime
//customers are to be debited first before sending airtime to them
app.post("/api/buyAirtime", async (req, res) => {
    let MomoNumber = req.body.MomoNumber;
    let recieverNumber = req.body.recieverNumber;
    let airtimeAmount = req.body.amount * 100;
    let chargedPrice = airtimeAmount;
    //multiple of 100, 100=1

    //Get sessionid to perform mpay-api operations
    let sessionID = await MPAY.genMpaySessionId();
    console.log("airtime session id:" + sessionID);
    if (sessionID !== null) {
        //trigger function to debit customer
        let requestID = String(Math.round(Math.random() * 10000000000));
        let customerDebit = await MPAY.MpayDebitCustomerMomo(MomoNumber, chargedPrice, requestID, sessionID);
        console.log("customerDebit is :" + customerDebit);
        if (customerDebit) {
            //wait for few seconds for the customer to approve the payment
            setTimeout(async () => {
                // trigger function for transaction status using the same requestid used for debiting
                let transactionStatus = await MPAY.mPayCustomerDebitTransactionCheck(requestID, sessionID);
                console.log("transactionStatus is :" + transactionStatus);
                if (transactionStatus) {
                    // trigger function to send airtime to customer
                    let airtimeTopUp = await MPAY.mpayTopupFlexi(
                        recieverNumber,
                        airtimeAmount,
                        sessionID
                    );
                    if (airtimeTopUp == "000") {
                        res.status(200).send("Airtime purchase successful");
                    } else if (airtimeTopUp == "042") {
                        res.status(400).send("Reciever number not a valid mtn number");
                    } else {
                        res.status(500).send("Error purchasing airtime");
                    }
                } else {
                    res.status(400).send("You have not approved payment, try again and approve withing 60 seconds");
                }
            }, 50000);
        } else {
            res.status(500).send("Error while trying to debit customer");
        }
    } else {
        res.status(500).send("Error generating sessionID for making mpay request");
    }
});

//endpoint for users to send money to another momo account
//customers are to be debited first before sending momo to receiver
app.post("/api/sendMoney", async (req, res) => {
    let MomoNumber = req.body.MomoNumber;
    let recieverNumber = req.body.recieverNumber;
    let momoAmount = req.body.amount * 100;
    let chargedPrice = momoAmount;

    //Get sessionid to perform mpay-api operations
    let sessionID = await MPAY.genMpaySessionId();
    if (sessionID) {
        //trigger function to debit customer
        let requestID = String(Math.round(Math.random() * 10000000000));
        let customerDebit = await MPAY.MpayDebitCustomerMomo(MomoNumber, chargedPrice, requestID, sessionID);
        console.log("customerDebit is :" + customerDebit);
        if (customerDebit) {
            //wait for few seconds for the customer to approve the payment
            setTimeout(async () => {
                // trigger function for transaction status using the same requestid used for debiting
                let transactionStatus = await MPAY.mPayCustomerDebitTransactionCheck(
                    requestID,
                    sessionID
                );
                console.log("transactionStatus is :" + transactionStatus);
                if (transactionStatus) {
                    // trigger function to send money from ourMpayWallet to reciever's momo
                    let momoTopUp = await MPAY.mPayDebitMPayWallet(sessionID, recieverNumber, momoAmount);
                    if (momoTopUp == "000") {
                        res.status(200).send("Money sent successfully");
                    } else if (momoTopUp == "042") {
                        res.status(400).send("Reciever number not a valid mtn number");
                        //todo: trigger a refund function.
                    } else {
                        res.status(500).send("Error sending momo");
                        //todo: create a refund function.
                    }
                } else {
                    res.status(400).send("You have not approved payment, try again and approve withing 40 seconds");
                }
            }, 50000); //function is executed after 50 seconds
        } else {
            res.status(500).send("Error while trying to debit customer");
        }
    } else {
        res.status(500).send("Error generating sessionID for making mpay request");
    }
});


//endpoint for buying mobile data bundle
app.post("/api/buydatabundle", async (req, res) => {
    var MTNMobileDataBundle = JSON.stringify(MPayMtnMobileDataBundle);
    var MobileDataBundle = JSON.parse(MTNMobileDataBundle);
    console.log(MobileDataBundle);

    let reqestedBundle = req.body.bundle;
    let recieverNumber = req.body.recieverNumber;
    let MomoNumber = req.body.MomoNumber;

    const databundle = MobileDataBundle.find(
        (bundle) => bundle.productCode == reqestedBundle
    );

    console.log(databundle.description, databundle.productCode, databundle.price);
    productCode = databundle.productCode;
    chargedPrice = databundle.price; //amount(multiple of 100. 1=100) to debit from customer momo before buying data bundle

    let sessionID = await MPAY.genMpaySessionId();
    if (sessionID) {
        //trigger function to debit customer
        let requestID = String(Math.round(Math.random() * 10000000000));
        let customerDebit = await MPAY.MpayDebitCustomerMomo(MomoNumber, chargedPrice, requestID, sessionID);
        console.log("customerDebit is :" + customerDebit);
        if (customerDebit) {
            //wait for few seconds for the customer to approve the payment
            setTimeout(async () => {
                // trigger function for transaction status using the same requestid used for debiting
                let transactionStatus = await MPAY.mPayCustomerDebitTransactionCheck(requestID, sessionID);
                console.log("transactionStatus is :" + transactionStatus);
                if (transactionStatus) {
                    // trigger function to send data bundle to customer
                    let topupFixCode = await MPAY.mpayMtnTopupFix(sessionID, recieverNumber, productCode);
                    if (topupFixCode == "000") {
                        res.status(200).send("Bundle purchase successful");
                    } else if (topupFixCode == "042") {
                        res.status(400).send("Reciever number not a valid mtn number");
                    } else {
                        res.status(500).send("Error purchasing mobile bundle");
                    }
                } else {
                    res.status(400).send("You have not approved payment, try again and approve withing 40 seconds");
                }
            }, 50000); //function is executed after 50 seconds
        } else {
            res.status(500).send("Error while trying to debit customer");
        }
    } else {
        res.status(500).send("Error generating sessionID for making mpay request");
    }

});


//endpoint to buy fibre bundle
app.post('/api/buyFibreBundle', async (req, res) => {
    var mtnFibreBundle = JSON.stringify(MPayMtnFibreBundle);
    var fibreBundle = JSON.parse(mtnFibreBundle);

    let requestedBundle = req.body.bundle
    let MomoNumber = req.body.MomoNumber
    let recieverNumber = req.body.recieverNumber

    const bundle = fibreBundle.find((bundle) => bundle.productCode == requestedBundle);
    console.log(bundle.description, bundle.productCode, bundle.price)
    let productCode = bundle.productCode;
    let chargedPrice = bundle.price //amount to debit customer
    let fibreTopUpAmount = bundle.price

    let sessionID = await MPAY.genMpaySessionId();
    if (sessionID) {
        let billPay = await MPAY.mpayBillpay(sessionID, recieverNumber, productCode, fibreTopUpAmount)
        if (billPay) {
            res.status(200);
        } else {
            res.status(500);
        }
    } else {
        res.status(500).send("Error generating mpay session id");
    }
})





//endpoint to fund our mpay wallet
app.post('/api/fundMpayWallet', async (req, res) => {
    let MomoNumber = req.body.MomoNumber;
    let momoAmount = req.body.amount * 100;
    let chargedPrice = momoAmount;

    //Get sessionid to perform mpay-api operations
    let sessionID = await MPAY.genMpaySessionId();
    if (sessionID) {
        //trigger function to debit customer
        let requestID = String(Math.round(Math.random() * 10000000000));
        let customerDebit = await MPAY.MpayDebitCustomerMomo(MomoNumber, chargedPrice, requestID, sessionID);
        if (customerDebit) {
            //wait for few seconds for the customer to approve the payment
            setTimeout(async () => {
                // trigger function for transaction status using the same requestid used for debiting
                let transactionStatus = await MPAY.mPayCustomerDebitTransactionCheck(requestID, sessionID);
                console.log("transactionStatus is :" + transactionStatus);
                if (transactionStatus) {
                    res.status(200).send("Mpay wallet funded successfully")
                } else {
                    res.status(400).send("You have not approved payment, try again and approve within 40 seconds");
                }
            }, 50000); //function is executed after 50 seconds
        } else {
            res.status(500).send("Error while trying to debit customer");
        }
    } else {
        res.status(500).send("Error generating sessionID for making mpay request");
    }
})







// app.post("/api/decrypt", async (req, res) => {
//     var input = "wuSF2CsDhWc1gWyHHBbUjCuCX9q5C1oyqEbk5I8sK8-a_rpKkbfg-NgKD577-_fDmV21pj8nSlWGVYGLB7dWU02UWOYVbf9_nVeozYC6rSqmNauSXlxlSdaiKfGM4E3ed8cuI86fX3Db5aej1Go6w9NcAICjv1kTXIozEE-MIQ_Bg_px0qrwHyXkg7VkAgC6E-30cJ0LT1lFuIdi7-AT-PJN3GwRFVIhp0O0sfDHDnejDlIAlW2NTwxgS8V-fm0WfG1gx2U05kICARnqMMXsaoCGSwkDOR5S8yObh-bRybY_SQvGyII1-g5LH5A2Dy0Wkc5D36O3eK3pE2kW2zdgHA,,";
//     let replaceChars = { '-': '+', '_': '/', ',': '=' }
//     let s = input.replace(/[-_,]/g, m => replaceChars[m]);
//     console.log('replacedText:' + s);

//     var resp = Cipherr.decrypt(key, s)

//     console.log(`${resp}`)
//     console.log(JSON.stringify(resp))
//     res.send(resp);
// });

app.use(cors);
exports.app = functions.https.onRequest(app);