var express = require("express");
var router = express.Router();
let { uploadExcel, uploadImage } = require('../utils/uploadHandler')
let path = require('path')
let excelJs = require('exceljs')
let crypto = require('crypto')
let categoriesModel = require('../schemas/categories')
let productsModel = require('../schemas/products')
let inventoriesModel = require('../schemas/inventories')
let rolesModel = require('../schemas/roles')
let userModel = require('../schemas/users')
let mongoose = require('mongoose')
let slugify = require('slugify')
let userController = require('../controllers/users')
let { sendUserPasswordMail } = require('../utils/mailHandler')

function getCellText(cellValue) {
    if (cellValue === null || cellValue === undefined) {
        return ''
    }
    if (typeof cellValue === 'object') {
        if (cellValue.text) {
            return String(cellValue.text).trim()
        }
        if (cellValue.hyperlink) {
            return String(cellValue.hyperlink).trim()
        }
        if (cellValue.result) {
            return String(cellValue.result).trim()
        }
        if (cellValue.richText) {
            return cellValue.richText.map(item => item.text).join('').trim()
        }
    }
    return String(cellValue).trim()
}

function buildHeaderMap(worksheet) {
    let headerRow = worksheet.getRow(1)
    let headerMap = new Map()
    for (let index = 1; index <= headerRow.cellCount; index++) {
        let headerValue = getCellText(headerRow.getCell(index).value).toLowerCase()
        if (headerValue) {
            headerMap.set(headerValue, index)
        }
    }
    return headerMap
}

function generateRandomPassword(length = 16) {
    return crypto.randomBytes(length * 2)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, length)
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files', 5), function (req, res, next) {
    console.log(req.body);
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(pathFile)
})
router.post('/excel/users', uploadExcel.single('file'), async function (req, res, next) {
    let workBook = new excelJs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workBook.xlsx.readFile(pathFile)
    let worksheet = workBook.worksheets[0];
    let userRole = await rolesModel.findOne({
        name: /^user$/i,
        isDeleted: false
    })

    if (!userRole) {
        res.status(400).send({
            message: 'khong tim thay role user'
        })
        return;
    }

    let headerMap = buildHeaderMap(worksheet)
    let usernameColumn = headerMap.get('username') || 1
    let emailColumn = headerMap.get('email') || 2
    let seenUsernames = new Set()
    let seenEmails = new Set()
    let result = [];

    for (let index = 2; index <= worksheet.rowCount; index++) {
        let row = worksheet.getRow(index)
        let username = getCellText(row.getCell(usernameColumn).value)
        let email = getCellText(row.getCell(emailColumn).value).toLowerCase()
        let rowError = []

        if (!username) {
            rowError.push('username khong duoc de trong')
        }
        if (!email) {
            rowError.push('email khong duoc de trong')
        } else if (!isValidEmail(email)) {
            rowError.push('email sai dinh dang')
        }
        if (username && seenUsernames.has(username)) {
            rowError.push('username bi trung trong file')
        }
        if (email && seenEmails.has(email)) {
            rowError.push('email bi trung trong file')
        }

        let existedUser = null
        if (username || email) {
            existedUser = await userModel.findOne({
                $or: [
                    { username: username },
                    { email: email }
                ]
            })
            if (existedUser?.username === username) {
                rowError.push('username da ton tai')
            }
            if (existedUser?.email === email) {
                rowError.push('email da ton tai')
            }
        }

        if (rowError.length > 0) {
            result.push({
                success: false,
                row: index,
                data: rowError
            })
            continue;
        }

        seenUsernames.add(username)
        seenEmails.add(email)

        let password = generateRandomPassword(16)
        try {
            let newUser = await userController.CreateAnUser(
                username,
                password,
                email,
                userRole._id
            )
            await sendUserPasswordMail(email, username, password)
            result.push({
                success: true,
                row: index,
                data: {
                    _id: newUser._id,
                    username: newUser.username,
                    email: newUser.email,
                    role: userRole.name
                }
            })
        } catch (error) {
            result.push({
                success: false,
                row: index,
                data: error.message
            })
        }
    }

    res.send(result)
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workBook = new excelJs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workBook.xlsx.readFile(pathFile)
    let worksheet = workBook.worksheets[0];
    let categories = await categoriesModel.find({})
    let categoriesMap = new Map();
    for (const category of categories) {
        categoriesMap.set(category.name, category.id);
    }
    let getProducts = await productsModel.find({})
    let getSKU = getProducts.map(p => p.sku)
    let getTitle = getProducts.map(p => p.title)
    let result = [];
    for (let index = 2; index <= worksheet.rowCount; index++) {
        let rowError = [];
        const row = worksheet.getRow(index)
        let sku = row.getCell(1).value;
        let title = row.getCell(2).value;
        let category = row.getCell(3).value;
        let price = Number.parseInt(row.getCell(4).value);
        let stock = Number.parseInt(row.getCell(5).value);

        if (price < 0 || isNaN(price)) {
            rowError.push("price phai la so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            rowError.push("stock phai la so duong")
        }
        if (!categoriesMap.has(category)) {
            rowError.push("category khong hop le")
        }
        if (getSKU.includes(sku)) {
            rowError.push("sku da ton tai")
        }
        if (getTitle.includes(title)) {
            rowError.push("title da ton tai")
        }
        if (rowError.length > 0) {
            result.push({
                success: false,
                data: rowError
            })
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newProduct = new productsModel({
                sku: sku,
                title: title,
                slug: slugify(title, {
                    replacement: '-',
                    remove: undefined,
                    lower: true,
                    strict: true
                }),
                price: price,
                description: title,
                category: categoriesMap.get(category),
            })
            await newProduct.save({ session })
            let newInventory = new inventoriesModel({
                product: newProduct._id,
                stock: stock
            })
            await newInventory.save({ session })
            await newInventory.populate('product')
            await session.commitTransaction();
            await session.endSession()
            result.push({
                success: true,
                data: newInventory
            })
        } catch (error) {
            await session.abortTransaction();
            await session.endSession()
            result.push({
                success: false,
                data: error.message
            })
        }
    }
    res.send(result)
})
module.exports = router;
