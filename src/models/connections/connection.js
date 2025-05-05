const {Sequelize, DataTypes} = require('sequelize');
const sequelize = new Sequelize({
    dialect: 'postgres',
    port: 5432,
    username: 'postgres',
    password: 'admin',
    host: 'localhost',
    database: 'chatbot'
});

module.exports = sequelize;