const sequelize = require('../connections/connection.js');
const {DataTypes} = require('sequelize');

const School = sequelize.define('school', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
    },
    inep: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    client: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    neighborhood: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    street: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    number: {
        type: DataTypes.STRING,
        allowNull: false,
    },
});

module.exports = School;
